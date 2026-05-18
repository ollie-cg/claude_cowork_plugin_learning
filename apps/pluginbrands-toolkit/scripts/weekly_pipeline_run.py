#!/usr/bin/env python3
"""Weekly pipeline report generator.

Adapted from tmp/runner_2026_05_15.py — promoted to a versioned, portable script.

Last regenerated from skills/brand-pipeline-report/SKILL.md on 2026-05-18.
If SKILL.md has been edited more recently than this file, rebuild the runner
from the spec before running (see apps/pluginbrands-toolkit/runbooks/weekly-pipeline.md).

Usage:
    python3 weekly_pipeline_run.py --window-end 2026-05-22 --brand goodrays
    python3 weekly_pipeline_run.py --window-end 2026-05-22 --all

Produces docs/temporary/{window_end}/{slug}.md and prints per-brand JSON stats
to stdout (one JSON object per brand, separated by newlines for --all).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, date, timedelta
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

BRAND_SLUGS = [
    "cans",
    "ecotone-clipper",
    "ecotone-kallo",
    "ecotone-mrs-crimbles",
    "glug",
    "goodrays",
    "love-corn",
    "moju",
    "momo-kombucha",
    "muller",
    "muller-frijj",
    "rawq",
    "rewater",
    "smol",
    "valeo-kettle",
    "valeo-poppets",
    "virtue",
    "who-gives-a-crap",
    "wow",
    "xoxo-soda",
]

PORTAL = "24916652"
PIPELINE_BUYER = "2760762586"
API_ROOT = "https://api.hubapi.com"

STAGE_NAMES = {
    "2760762587": "Discovery",
    "2760762588": "Follow Up",
    "4443390197": "Feedback Pending",
    "4443390198": "Feedback Received",
    "3774636263": "Proposal",
    "3774636264": "Proposal Feedback Pending",
    "4443390199": "Won",
    "3774636266": "Lost",
    "3774636267": "No Response",
}
STAGE_ORDER = [
    "Discovery", "Follow Up", "Feedback Pending", "Feedback Received",
    "Proposal", "Proposal Feedback Pending", "Won", "Lost", "No Response",
]
STALE_STAGES = {"Proposal Feedback Pending", "Feedback Pending", "Feedback Received"}

PITCH_STAGE_NAMES = {
    "6f14f8f1-407b-4b5b-99a7-db681b779076": "Proposed",
    "4549842107": "Negotiation",
    "4549842108": "Product Placed",
    "4549842109": "Declined",
    "4549842110": "Discontinued",
}


def load_token() -> str:
    tok = os.environ.get("HUBSPOT_TOKEN")
    if not tok:
        env_file = REPO_ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("HUBSPOT_TOKEN="):
                    tok = line.split("=", 1)[1].strip()
                    break
    if not tok or not tok.startswith("pat-eu1-"):
        print("error: HUBSPOT_TOKEN missing or malformed (expected pat-eu1-...). "
              f"Set it in {REPO_ROOT/'.env'} or export it.", file=sys.stderr)
        sys.exit(2)
    return tok


def slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def http(method, path, headers, body=None, params=None, retries=6):
    url = API_ROOT + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as resp:
                raw = resp.read()
                if not raw:
                    return {}
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:300]
            if e.code == 429 or e.code >= 500:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                try:
                    wait = float(retry_after) if retry_after else 1.5 * (attempt + 1)
                except ValueError:
                    wait = 1.5 * (attempt + 1)
                wait = min(max(wait, 1.0), 30.0)
                time.sleep(wait)
                last_err = f"{e.code}: {err_body}"
                continue
            if e.code == 404:
                return {"_404": True}
            raise RuntimeError(f"HTTP {e.code} {url}: {err_body}") from e
        except Exception as e:
            last_err = str(e)
            time.sleep(1 + attempt)
    raise RuntimeError(f"http failed after retries: {last_err}")


def search_objects(headers, object_type, filter_groups, properties, limit=100, sorts=None):
    after = None
    body = {"filterGroups": filter_groups, "properties": properties, "limit": limit}
    if sorts:
        body["sorts"] = sorts
    while True:
        if after:
            body["after"] = after
        else:
            body.pop("after", None)
        data = http("POST", f"/crm/v3/objects/{object_type}/search", headers, body=body)
        for r in data.get("results", []):
            yield r
        paging = data.get("paging", {}).get("next")
        if not paging:
            break
        after = paging.get("after")
        if not after:
            break


def batch_read(headers, object_type, ids, properties, properties_with_history=None):
    out = {}
    chunk = 50 if properties_with_history else 100
    for i in range(0, len(ids), chunk):
        sub = ids[i:i + chunk]
        body = {"properties": properties, "inputs": [{"id": str(x)} for x in sub]}
        if properties_with_history:
            body["propertiesWithHistory"] = properties_with_history
        try:
            data = http("POST", f"/crm/v3/objects/{object_type}/batch/read", headers, body=body)
        except RuntimeError as e:
            if "404" in str(e):
                continue
            raise
        for r in data.get("results", []):
            out[r["id"]] = r
    return out


def get_associations(headers, from_type, from_id, to_type):
    path = f"/crm/v4/objects/{from_type}/{from_id}/associations/{to_type}"
    after = None
    ids = []
    while True:
        params = {"limit": 500}
        if after:
            params["after"] = after
        data = http("GET", path, headers, params=params)
        if data.get("_404"):
            return []
        for r in data.get("results", []):
            ids.append(r.get("toObjectId") or r.get("to", {}).get("id"))
        paging = data.get("paging", {}).get("next")
        if not paging:
            break
        after = paging.get("after")
        if not after:
            break
    return [str(i) for i in ids if i]


def list_owners(headers):
    out = {}
    after = None
    while True:
        params = {"limit": 100}
        if after:
            params["after"] = after
        data = http("GET", "/crm/v3/owners", headers, params=params)
        for r in data.get("results", []):
            name = " ".join(filter(None, [r.get("firstName"), r.get("lastName")])) or r.get("email", "—")
            out[r["id"]] = name
        paging = data.get("paging", {}).get("next")
        if not paging:
            break
        after = paging.get("after")
        if not after:
            break
    return out


def parse_ts(ts):
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    if isinstance(ts, str):
        s = ts.strip()
        if not s:
            return None
        try:
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            return datetime.fromisoformat(s)
        except Exception:
            pass
        try:
            return datetime.fromtimestamp(int(s) / 1000, tz=timezone.utc)
        except Exception:
            return None
    return None


def fmt_date(ts):
    dt = parse_ts(ts) if not isinstance(ts, datetime) else ts
    if dt is None:
        return "—"
    return dt.date().isoformat()


def stage_name(stage_id):
    if not stage_id:
        return "—"
    return STAGE_NAMES.get(stage_id, f"Stage {stage_id}")


def emdash(v):
    if v is None:
        return "—"
    if isinstance(v, str) and not v.strip():
        return "—"
    return v


def resolve_slug(headers, brand_slug):
    """Re-discover the canonical Client Services hs_name for a slug. Returns
    (canonical_name, portfolio_names_set). Exits 2 with candidates if no match."""
    clients = list(search_objects(headers, "0-162", filter_groups=[], properties=["hs_name"], limit=100))
    client_names = sorted({c["properties"].get("hs_name", "").strip()
                           for c in clients if c.get("properties")})
    matches = [n for n in client_names if n and slugify(n) == brand_slug]
    if len(matches) == 1:
        portfolio = {n.lower() for n in client_names if n}
        return matches[0], portfolio
    if len(matches) > 1:
        print(f"error: slug {brand_slug!r} matches multiple hs_names: {matches}",
              file=sys.stderr)
        sys.exit(2)
    near = [n for n in client_names if brand_slug.split("-")[0] in slugify(n)]
    print(f"error: slug {brand_slug!r} did not match any Client Services hs_name. "
          f"Nearby candidates (first 10): {near[:10]}", file=sys.stderr)
    sys.exit(2)


def run_brand(brand_slug, window_end_date, headers):
    """Generate one brand md and return stats dict. Stage-by-stage echo to stderr."""
    window_start_date = window_end_date - timedelta(days=7)
    today = window_end_date

    out_dir = REPO_ROOT / "docs" / "temporary" / today.isoformat()
    out_file = out_dir / f"{brand_slug}.md"

    def in_window(ts):
        if ts is None:
            return False
        d = ts.date()
        return window_start_date <= d <= window_end_date

    # --- Step 2: Confirm brand ---------------------------------------------
    print(f"[1/8] [{brand_slug}] Confirming brand...", file=sys.stderr)
    live_brand, portfolio = resolve_slug(headers, brand_slug)
    print(f"   [{brand_slug}] canonical = {live_brand!r}", file=sys.stderr)

    # --- Step 3-4: Brand records, dedupe -----------------------------------
    print(f"[2/8] [{brand_slug}] Brand records (0-970)...", file=sys.stderr)
    brand_records = list(search_objects(
        headers,
        "0-970",
        filter_groups=[{"filters": [{"propertyName": "client_name_sync",
                                     "operator": "EQ", "value": live_brand}]}],
        properties=["hs_name", "hs_createdate", "hs_pipeline_stage"],
        limit=200,
        sorts=[{"propertyName": "hs_createdate", "direction": "ASCENDING"}],
    ))
    print(f"   [{brand_slug}] {len(brand_records)} brand records (pre-dedupe)", file=sys.stderr)

    deal_to_brand = {}
    deal_id_re = re.compile(r"\[(\d+)\]")
    for br in brand_records:
        nm = br.get("properties", {}).get("hs_name", "") or ""
        m = deal_id_re.search(nm)
        if not m:
            continue
        did = m.group(1)
        if did not in deal_to_brand:
            deal_to_brand[did] = br["id"]
    print(f"   [{brand_slug}] {len(deal_to_brand)} unique deal ids after dedupe", file=sys.stderr)

    # --- Step 5: Deals + history -------------------------------------------
    print(f"[3/8] [{brand_slug}] Deals + dealstage history...", file=sys.stderr)
    deal_ids = list(deal_to_brand.keys())
    deal_props = [
        "dealname", "dealstage", "pipeline", "hubspot_owner_id",
        "hs_createdate", "closedate", "route_to_market",
        "notes_last_contacted", "num_notes", "num_associated_contacts",
        "number_of_sites", "closed_lost_reason",
    ]
    deals_raw = batch_read(headers, "deals", deal_ids, deal_props,
                           properties_with_history=["dealstage"])

    excluded_pipeline = 0
    deals = {}
    for did, d in deals_raw.items():
        p = d.get("properties", {}).get("pipeline")
        if p != PIPELINE_BUYER:
            excluded_pipeline += 1
            continue
        deals[did] = d
    print(f"   [{brand_slug}] {len(deals)} in Buyer Deal Pipeline; {excluded_pipeline} excluded",
          file=sys.stderr)

    pipeline_meta = http("GET", f"/crm/v3/pipelines/deals/{PIPELINE_BUYER}", headers)
    for st in pipeline_meta.get("stages", []):
        sid = st.get("id"); label = st.get("label")
        if sid and label:
            STAGE_NAMES[sid] = label

    def derive(d):
        props = d.get("properties", {})
        pwh = d.get("propertiesWithHistory", {}).get("dealstage", []) or []
        history = []
        for entry in pwh:
            ts = parse_ts(entry.get("timestamp"))
            history.append({"value": entry.get("value"), "ts": ts})
        transitions_in_window = []
        for i, entry in enumerate(history):
            if entry["ts"] is None:
                continue
            if in_window(entry["ts"]):
                from_stage = None
                if i + 1 < len(history):
                    from_stage = history[i + 1]["value"]
                transitions_in_window.append({
                    "to_stage": entry["value"],
                    "from_stage": from_stage,
                    "ts": entry["ts"],
                    "is_oldest": (i == len(history) - 1),
                })
        created = parse_ts(props.get("hs_createdate"))
        created_in_window = in_window(created)
        latest_transition = transitions_in_window[0] if transitions_in_window else None
        return {
            "props": props, "history": history,
            "transitions_in_window": transitions_in_window,
            "created": created, "created_in_window": created_in_window,
            "latest_transition": latest_transition,
        }

    for did, d in deals.items():
        d["_d"] = derive(d)

    # --- Step 6: Owners ----------------------------------------------------
    print(f"[4/8] [{brand_slug}] Owners...", file=sys.stderr)
    owners = list_owners(headers)

    # --- Step 7: Contacts --------------------------------------------------
    print(f"[5/8] [{brand_slug}] Contacts...", file=sys.stderr)
    deal_to_contacts = {}
    all_contact_ids = set()
    for did in deals:
        cids = get_associations(headers, "deals", did, "contacts")
        deal_to_contacts[did] = cids
        for c in cids:
            all_contact_ids.add(c)
    contacts_raw = batch_read(headers, "contacts", list(all_contact_ids),
        ["firstname", "lastname", "email", "jobtitle"])

    def render_person(c):
        p = c.get("properties", {}) if c else {}
        fn = (p.get("firstname") or "").strip()
        ln = (p.get("lastname") or "").strip()
        em = (p.get("email") or "").strip()
        jt = (p.get("jobtitle") or "").strip()
        if fn and ln:
            out = f"{fn} {ln}"
            if jt:
                out += f", {jt}"
            return out
        if em:
            return em
        return "Contact"

    def primary_contact(did):
        cids = deal_to_contacts.get(did, [])
        if not cids:
            return None
        for cid in cids:
            if cid in contacts_raw:
                return contacts_raw[cid]
        return None

    # --- Step 8: Engagements -----------------------------------------------
    print(f"[6/8] [{brand_slug}] Engagements...", file=sys.stderr)
    deal_engagements = {}
    for did, d in deals.items():
        nn = d["_d"]["props"].get("num_notes")
        try:
            nn_int = int(nn) if nn is not None else 0
        except Exception:
            nn_int = 0
        if nn_int <= 0:
            deal_engagements[did] = []
            continue
        eng_ids = get_associations(headers, "deals", did, "0-4")
        eng_ids_int = sorted({int(x) for x in eng_ids if str(x).isdigit()}, reverse=True)
        deal_engagements[did] = [str(x) for x in eng_ids_int[:15]]

    all_eng_ids = sorted({eid for lst in deal_engagements.values() for eid in lst})
    print(f"   [{brand_slug}] total engagement IDs to fetch: {len(all_eng_ids)}", file=sys.stderr)
    engagements_raw = batch_read(headers, "0-4", all_eng_ids,
        ["hs_engagement_type", "hs_email_subject", "hs_body_preview",
         "hs_meeting_title", "hs_note_body", "hs_timestamp",
         "hs_email_direction", "hubspot_owner_id"])

    # --- Step 9: Pitches ---------------------------------------------------
    print(f"[7/8] [{brand_slug}] Pitches...", file=sys.stderr)
    deal_pitches = {}
    all_pitch_ids = set()
    brand_to_pitches = {}
    for did, bid in deal_to_brand.items():
        if did not in deals:
            continue
        pids = get_associations(headers, "0-970", bid, "0-420")
        brand_to_pitches[bid] = pids
        for p in pids:
            all_pitch_ids.add(p)
    pitches_raw = batch_read(headers, "0-420", list(all_pitch_ids),
                             ["hs_name", "hs_pipeline_stage"])

    for did, bid in deal_to_brand.items():
        if did not in deals:
            continue
        pids = brand_to_pitches.get(bid, [])
        counts = {"total": 0, "placed": 0, "declined": 0, "proposed": 0, "other": 0}
        for pid in pids:
            p = pitches_raw.get(pid)
            if not p:
                continue
            s = p.get("properties", {}).get("hs_pipeline_stage")
            counts["total"] += 1
            nm = PITCH_STAGE_NAMES.get(s, "Other")
            if nm == "Product Placed":
                counts["placed"] += 1
            elif nm == "Declined":
                counts["declined"] += 1
            elif nm == "Proposed":
                counts["proposed"] += 1
            else:
                counts["other"] += 1
        deal_pitches[did] = counts

    def pitches_line(did):
        c = deal_pitches.get(did, {"total": 0, "placed": 0, "declined": 0, "proposed": 0})
        if c["total"] == 0:
            return "no pitches"
        return f"{c['total']} pitches ({c['placed']} placed / {c['declined']} declined / {c['proposed']} proposed)"

    # --- Brand-mention scan ------------------------------------------------
    brand_re = re.compile(re.escape(live_brand), re.IGNORECASE)
    extra_terms = []
    parts = re.split(r"\s*[-/&]\s*|\s+-\s+", live_brand)
    for p in parts:
        p = p.strip()
        if p and len(p) > 2 and p.lower() not in {"and", "the"}:
            extra_terms.append(p)
    extra_re = [re.compile(re.escape(t), re.IGNORECASE) for t in extra_terms]

    def mentions_brand(eng):
        p = eng.get("properties", {}) if eng else {}
        blob = " ".join([
            p.get("hs_body_preview") or "",
            p.get("hs_email_subject") or "",
            p.get("hs_meeting_title") or "",
            p.get("hs_note_body") or "",
        ])
        if not blob.strip():
            return False
        if brand_re.search(blob):
            return True
        for r in extra_re:
            if r.search(blob):
                return True
        return False

    deal_engagement_meta = {}
    for did, eids in deal_engagements.items():
        items = []
        for eid in eids:
            e = engagements_raw.get(eid)
            if not e:
                continue
            p = e.get("properties", {})
            items.append({
                "id": eid,
                "type": p.get("hs_engagement_type"),
                "subject": p.get("hs_email_subject"),
                "body": p.get("hs_body_preview"),
                "meeting_title": p.get("hs_meeting_title"),
                "note_body": p.get("hs_note_body"),
                "ts": parse_ts(p.get("hs_timestamp")),
                "direction": p.get("hs_email_direction"),
                "owner_id": p.get("hubspot_owner_id"),
                "mentions_brand": mentions_brand(e),
            })
        items.sort(key=lambda x: (x["ts"] or datetime.min.replace(tzinfo=timezone.utc)),
                   reverse=True)
        deal_engagement_meta[did] = items

    # --- Annotations -------------------------------------------------------
    def annotate(did):
        d = deals[did]
        props = d["_d"]["props"]
        dealname = props.get("dealname", "") or ""
        coll = None
        if dealname.strip().lower() in portfolio and dealname.strip().lower() != live_brand.lower():
            coll = f"⚠️ Possible mis-pipelined deal: buyer name matches portfolio client \"{dealname}\"."

        stale = None
        cur_stage = stage_name(props.get("dealstage"))
        if cur_stage in STALE_STAGES:
            nlc = parse_ts(props.get("notes_last_contacted"))
            cutoff_d = today - timedelta(days=21)
            last_contact_old = nlc is None or nlc.date() < cutoff_d
            recent_incoming = False
            for e in deal_engagement_meta.get(did, []):
                if e["type"] == "INCOMING_EMAIL" and e["ts"] and e["ts"].date() >= cutoff_d:
                    recent_incoming = True
                    break
            if last_contact_old and not recent_incoming:
                stale = "⚠️ Stage may be stale (no buyer reply in 21+ days)."

        pc = deal_pitches.get(did, {"total": 0, "placed": 0})
        has_placed = pc["placed"] >= 1

        engs = deal_engagement_meta.get(did, [])
        engs_mentioning_brand = sum(1 for e in engs if e["mentions_brand"])
        relevance = pc["total"] * 3 + engs_mentioning_brand
        return {
            "collision_warning": coll,
            "stale_warning": stale,
            "has_placed_pitch": has_placed,
            "engagements_mentioning_brand": engs_mentioning_brand,
            "relevance": relevance,
        }

    for did in deals:
        deals[did]["_ann"] = annotate(did)

    # --- Classification ----------------------------------------------------
    WINS_LOSSES = []
    STAGE_MOVES = []
    NEW_DEALS = []
    MEETINGS = []
    NOTABLE = []
    STILL_WARM = []
    AUTO_ATTACHED_ONLY = []

    notable_keywords = [
        "sample", "samples", "pitch", "pitched", "pricing", "quote",
        "distributor", "meeting", "invite", "introduce", "intro",
        "proposal", "attached",
    ]
    for n in portfolio:
        if n and len(n) > 2:
            notable_keywords.append(n)

    def is_notable_outbound(body, subject):
        text = " ".join(filter(None, [body, subject])).lower()
        if not text.strip():
            return False
        if len(text.split()) >= 50:
            return True
        return any(kw in text for kw in notable_keywords)

    def is_bounce(body, subject, sender_label):
        blob = " ".join(filter(None, [body, subject])).lower()
        if "mailer-daemon" in (sender_label or "").lower():
            return True
        return ("delivery has failed" in blob or "address not found" in blob
                or "undeliverable" in blob)

    def is_ooo(body, subject):
        blob = " ".join(filter(None, [body, subject])).lower()
        return ("out of office" in blob or "ooo" in blob or "auto-reply" in blob
                or "automatic reply" in blob)

    for did, d in deals.items():
        derived = d["_d"]
        ann = d["_ann"]
        cur_stage = stage_name(derived["props"].get("dealstage"))
        transitions = derived["transitions_in_window"]
        placed_in_a_section = False

        win_loss_transition = None
        other_transitions = []
        for t in transitions:
            nm = stage_name(t["to_stage"])
            if nm in ("Won", "Lost"):
                if win_loss_transition is None or (t["ts"] and (not win_loss_transition["ts"] or t["ts"] > win_loss_transition["ts"])):
                    win_loss_transition = t
            else:
                other_transitions.append(t)

        if win_loss_transition is not None:
            WINS_LOSSES.append((did, win_loss_transition))
            placed_in_a_section = True
        elif other_transitions:
            if not derived["created_in_window"]:
                STAGE_MOVES.append((did, other_transitions[0]))
                placed_in_a_section = True

        if derived["created_in_window"]:
            NEW_DEALS.append((did, other_transitions[0] if other_transitions else None))
            placed_in_a_section = True

        in_window_meetings = [e for e in deal_engagement_meta.get(did, []) if e["type"] == "MEETING" and e["ts"] and in_window(e["ts"])]
        if in_window_meetings:
            MEETINGS.append((did, in_window_meetings))
            placed_in_a_section = True

        in_window_engs = [e for e in deal_engagement_meta.get(did, []) if e["ts"] and in_window(e["ts"])]
        notable_engs = []
        for e in in_window_engs:
            if e["type"] == "MEETING":
                continue
            body = e.get("body") or ""
            subject = e.get("subject") or ""
            if e["type"] == "INCOMING_EMAIL":
                if is_ooo(body, subject):
                    continue
                notable_engs.append(e)
            elif e["type"] in ("EMAIL", "NOTE"):
                if is_bounce(body, subject, None):
                    notable_engs.append(e)
                elif is_notable_outbound(body, subject):
                    notable_engs.append(e)

        if not notable_engs:
            ooo_only = [e for e in in_window_engs if e["type"] == "INCOMING_EMAIL" and is_ooo(e.get("body") or "", e.get("subject") or "")]
            if ooo_only and not in_window_meetings and not transitions:
                notable_engs = ooo_only[:1]
        if notable_engs:
            NOTABLE.append((did, notable_engs))
            placed_in_a_section = True

        closed_stages = {"Won", "Lost"}
        nn = derived["props"].get("num_notes") or "0"
        try:
            nn_int = int(nn)
        except Exception:
            nn_int = 0

        if not placed_in_a_section and cur_stage not in closed_stages and nn_int > 0 and ann["relevance"] >= 1:
            STILL_WARM.append(did)

        if ann["relevance"] == 0 and win_loss_transition is None and not placed_in_a_section:
            AUTO_ATTACHED_ONLY.append(did)

    def t_ts(item):
        t = item[1]
        if t and t.get("ts"):
            return t["ts"]
        return datetime.min.replace(tzinfo=timezone.utc)

    WINS_LOSSES.sort(key=t_ts, reverse=True)
    STAGE_MOVES.sort(key=t_ts, reverse=True)
    NEW_DEALS.sort(key=lambda x: deals[x[0]]["_d"]["created"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    MEETINGS.sort(key=lambda x: max(e["ts"] for e in x[1] if e["ts"]) if x[1] else datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    NOTABLE.sort(key=lambda x: max(e["ts"] for e in x[1] if e["ts"]) if x[1] else datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    STILL_WARM.sort(key=lambda did: parse_ts(deals[did]["_d"]["props"].get("notes_last_contacted")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    # --- Render ------------------------------------------------------------
    def deal_url(did):
        return f"https://app-eu1.hubspot.com/contacts/{PORTAL}/record/0-3/{did}"

    def owner_name(did):
        oid = deals[did]["_d"]["props"].get("hubspot_owner_id")
        if not oid:
            return "—"
        return owners.get(oid, "—")

    def truncate_quote(s, max_words=50):
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s.strip())
        words = s.split()
        if len(words) > max_words:
            return " ".join(words[:max_words]) + "…"
        return s

    def render_recent_exchange(did, e, contact):
        ts = fmt_date(e["ts"])
        typ = e["type"]
        body = e.get("body") or e.get("note_body") or ""
        body = truncate_quote(body, 50)
        annot = "[mentions " + live_brand + "]" if e["mentions_brand"] else "[portfolio-wide]"
        if typ == "MEETING":
            title = e.get("meeting_title") or "(no title)"
            return f"  - {ts} — Meeting logged: \"{title}\" {annot}"
        if typ == "INCOMING_EMAIL":
            person = render_person(contact) if contact else "Contact"
            sender = person.split(",")[0]
            if body:
                return f"  - {ts} — {sender} replied: _\"{body}\"_ {annot}"
            subj = e.get("subject") or ""
            return f"  - {ts} — {sender} replied: _\"{truncate_quote(subj, 30)}\"_ {annot}"
        if typ == "EMAIL":
            oid = e.get("owner_id")
            sender = owners.get(oid, "—") if oid else "—"
            if body:
                return f"  - {ts} — {sender} sent: _\"{body}\"_ {annot}"
            subj = e.get("subject") or ""
            return f"  - {ts} — {sender} sent: _\"{truncate_quote(subj, 30)}\"_ {annot}"
        return f"  - {ts} — {typ}: _\"{body}\"_ {annot}"

    def num_engagements_total(did):
        nn = deals[did]["_d"]["props"].get("num_notes") or "0"
        try:
            return int(nn)
        except Exception:
            return 0

    def last_contact_str(did):
        nlc = parse_ts(deals[did]["_d"]["props"].get("notes_last_contacted"))
        if nlc is None:
            return "—"
        return nlc.date().isoformat()

    def block_header(did):
        dealname = deals[did]["_d"]["props"].get("dealname") or "(no name)"
        return f"### {dealname} — deal [`{did}`](" + deal_url(did) + ")"

    def activity_line(did):
        nn = num_engagements_total(did)
        mentions_count = sum(1 for e in deal_engagement_meta.get(did, []) if e["mentions_brand"])
        lc = last_contact_str(did)
        if nn == 0:
            return f"**Activity (deal-wide):** 0 engagements, last contact {lc}"
        return f"**Activity (deal-wide):** {nn} engagements ({mentions_count} mention \"{live_brand}\"), last contact {lc}"

    def stage_basic_line(did):
        cs = stage_name(deals[did]["_d"]["props"].get("dealstage"))
        return f"**Stage:** {cs}"

    def render_warnings(did):
        out = []
        ann = deals[did]["_ann"]
        if ann["collision_warning"]:
            out.append(f"- {ann['collision_warning']}")
        if ann["stale_warning"]:
            out.append(f"- {ann['stale_warning']}")
        return out

    def relevance_inline(did):
        ann = deals[did]["_ann"]
        if ann["relevance"] == 0:
            return f" _(no {live_brand}-specific pitches or mentions yet — portfolio-level motion)_"
        return ""

    def auto_attached_warning(did, kind):
        ann = deals[did]["_ann"]
        if kind == "win_loss" and not ann["has_placed_pitch"]:
            return f"- ⚠️ Auto-attached only — no {live_brand} pitches placed; treat as a portfolio relationship event, not a {live_brand} placement."
        return None

    def primary_contact_line(did):
        c = primary_contact(did)
        if not c:
            return None
        p = c.get("properties", {})
        fn = (p.get("firstname") or "").strip()
        ln = (p.get("lastname") or "").strip()
        em = (p.get("email") or "").strip()
        jt = (p.get("jobtitle") or "").strip()
        if fn and ln:
            s = f"{fn} {ln}"
            if em:
                s += f" <{em}>"
            if jt:
                s += f", {jt}"
            return f"- **Primary contact:** {s}"
        if em:
            return f"- **Primary contact:** {em}"
        return None

    def site_route_line(did):
        p = deals[did]["_d"]["props"]
        sites = emdash(p.get("number_of_sites"))
        rtm = emdash(p.get("route_to_market"))
        own = owner_name(did)
        return f"**Owner:** {own}  •  **Sites:** {sites}  •  **Route to market:** {rtm}"

    def build_summary(did):
        engs = deal_engagement_meta.get(did, [])
        if not engs:
            return None
        e = engs[0]
        ts = fmt_date(e["ts"])
        body = (e.get("body") or e.get("note_body") or "").strip()
        body_short = truncate_quote(body, 30)
        typ = e["type"]
        contact = primary_contact(did)
        person = render_person(contact).split(",")[0] if contact else "the contact"
        if typ == "MEETING":
            title = e.get("meeting_title") or "(no title)"
            return f"Most recent fetched activity is a meeting on {ts}: \"{title}\"."
        if typ == "INCOMING_EMAIL":
            return f"Latest fetched reply on {ts} from {person}: _\"{body_short}\"_."
        if typ == "EMAIL":
            oid = e.get("owner_id")
            sender = owners.get(oid, "—") if oid else "—"
            return f"Latest fetched outbound on {ts} from {sender}: _\"{body_short}\"_."
        if body_short:
            return f"Latest fetched activity on {ts}: _\"{body_short}\"_."
        return None

    print(f"[8/8] [{brand_slug}] Rendering markdown...", file=sys.stderr)

    lines = []
    lines.append(f"# {live_brand} — Weekly Pipeline Update")
    lines.append("")
    lines.append(f"_Generated {today.isoformat()}. Window: {window_start_date.isoformat()} → {window_end_date.isoformat()} (rolling 7 days)._")
    lines.append(f"_Pitches and Brand records are {live_brand}-specific. Engagements, sites, route to market, contacts, and Summary are deal-wide (cover all Plugin Brands portfolio brands at this buyer)._")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## This Week")
    lines.append("")

    any_motion = bool(WINS_LOSSES or STAGE_MOVES or NEW_DEALS or MEETINGS or NOTABLE)
    if not any_motion:
        lines.append("_No new motion this week._")
        lines.append("")

    def emit_block(did, scope_warn_kind=None, stage_override=None, extra_first=None,
                   include_recent=True, summary_required=False, recent_filter=None):
        out = []
        out.append(f"<!-- DEAL_START {did} -->")
        out.append(block_header(did))
        out.extend(render_warnings(did))
        if scope_warn_kind:
            w = auto_attached_warning(did, scope_warn_kind)
            if w:
                out.append(w)
        if extra_first:
            out.append(extra_first)
        if stage_override is not None:
            out.append(stage_override)
        else:
            out.append(f"- {stage_basic_line(did)}")
        out.append(f"- {site_route_line(did)}")
        pl = pitches_line(did)
        suffix = relevance_inline(did)
        out.append(f"- **Pitches ({live_brand}-specific):** {pl}{suffix}")
        out.append(f"- {activity_line(did)}")
        pcl = primary_contact_line(did)
        if pcl:
            out.append(pcl)
        if include_recent or summary_required:
            if num_engagements_total(did) > 0:
                s = build_summary(did)
                if s:
                    out.append(f"- **Summary:** {s}")
        if include_recent:
            engs = deal_engagement_meta.get(did, [])
            if recent_filter:
                engs = recent_filter(engs)
            if engs:
                out.append("- **Recent exchanges:**")
                contact = primary_contact(did)
                for e in engs[:3]:
                    out.append(render_recent_exchange(did, e, contact))
        out.append(f"<!-- DEAL_END {did} -->")
        return out

    if WINS_LOSSES:
        lines.append(f"### Wins / Losses ({len(WINS_LOSSES)})")
        lines.append("")
        for did, t in WINS_LOSSES:
            cur = stage_name(deals[did]["_d"]["props"].get("dealstage"))
            from_nm = stage_name(t["from_stage"]) if t["from_stage"] else "—"
            when = fmt_date(t["ts"])
            stage_line = f"- **Stage:** {cur} — moved from {from_nm} on {when}"
            block = emit_block(did, scope_warn_kind="win_loss", stage_override=stage_line, include_recent=True)
            lines.extend(block)
            lines.append("")

    if STAGE_MOVES:
        lines.append(f"### Stage moves ({len(STAGE_MOVES)})")
        lines.append("")
        for did, t in STAGE_MOVES:
            cur = stage_name(deals[did]["_d"]["props"].get("dealstage"))
            from_nm = stage_name(t["from_stage"]) if t["from_stage"] else "—"
            when = fmt_date(t["ts"])
            stage_line = f"- **Stage:** {cur} — moved from {from_nm} on {when}"
            block = emit_block(did, stage_override=stage_line, include_recent=True)
            lines.extend(block)
            lines.append("")

    if NEW_DEALS:
        lines.append(f"### New deals ({len(NEW_DEALS)})")
        lines.append("")
        for did, move in NEW_DEALS:
            cur = stage_name(deals[did]["_d"]["props"].get("dealstage"))
            created_d = fmt_date(deals[did]["_d"]["created"])
            if move and move.get("to_stage"):
                mv_to = stage_name(move["to_stage"])
                mv_when = fmt_date(move["ts"])
                stage_line = f"- **Stage:** {cur} (created {created_d} → moved to {mv_to} on {mv_when})"
            else:
                stage_line = f"- **Stage:** {cur} (at creation, {created_d})"
            block = emit_block(did, stage_override=stage_line, include_recent=True)
            lines.extend(block)
            lines.append("")

    if MEETINGS:
        lines.append(f"### Calls & meetings ({len(MEETINGS)})")
        lines.append("")
        for did, mtgs in MEETINGS:
            m = mtgs[0]
            when = fmt_date(m["ts"])
            title = m.get("meeting_title") or "(no title)"
            annot = f"[mentions {live_brand}]" if m["mentions_brand"] else "[portfolio-wide]"
            meeting_first = f"- **Meeting on {when}:** \"{title}\" {annot}"
            block = emit_block(did, extra_first=meeting_first, include_recent=True)
            lines.extend(block)
            lines.append("")

    if NOTABLE:
        lines.append(f"### Notable exchanges ({len(NOTABLE)})")
        lines.append("")
        for did, engs in NOTABLE:
            ids_set = {e["id"] for e in engs}

            def _filter(all_engs, ids_set=ids_set):
                in_w = [e for e in all_engs if e["id"] in ids_set]
                others = [e for e in all_engs if e["id"] not in ids_set]
                return in_w + others

            block = emit_block(did, include_recent=True, recent_filter=_filter)
            lines.extend(block)
            lines.append("")

    lines.append("---")
    lines.append("")

    if STILL_WARM:
        lines.append(f"## Still warm — no movement this week ({len(STILL_WARM)})")
        lines.append("")
        for did in STILL_WARM:
            block = emit_block(did, include_recent=False, summary_required=True)
            lines.extend(block)
            lines.append("")
        lines.append("---")
        lines.append("")

    lines.append("## Pipeline snapshot")
    lines.append("")
    lines.append("| Stage | Total | New this week | Moved in this week |")
    lines.append("|---|---|---|---|")

    stage_totals = Counter()
    stage_new = Counter()
    stage_moved_in = Counter()
    for did, d in deals.items():
        cur = stage_name(d["_d"]["props"].get("dealstage"))
        stage_totals[cur] += 1
        if d["_d"]["created_in_window"]:
            stage_new[cur] += 1
        lt = d["_d"]["latest_transition"]
        if lt:
            stage_moved_in[stage_name(lt["to_stage"])] += 1

    total_unique = len(deals)
    total_new = sum(1 for d in deals.values() if d["_d"]["created_in_window"])
    total_moved = sum(1 for d in deals.values() if d["_d"]["latest_transition"])

    for s in STAGE_ORDER:
        if stage_totals[s] == 0 and stage_new[s] == 0 and stage_moved_in[s] == 0:
            continue
        lines.append(f"| {s} | {stage_totals[s]} | {stage_new[s]} | {stage_moved_in[s]} |")
    extras = sorted(set(stage_totals) - set(STAGE_ORDER))
    for s in extras:
        if stage_totals[s] == 0:
            continue
        lines.append(f"| {s} | {stage_totals[s]} | {stage_new[s]} | {stage_moved_in[s]} |")
    lines.append(f"| **Total unique deals** | **{total_unique}** | **{total_new}** | **{total_moved}** |")
    lines.append("")
    lines.append(f"_{len(AUTO_ATTACHED_ONLY)} of {total_unique} deals are auto-attached only (no {live_brand} pitches and no engagement mentioning {live_brand}); they are summed in the table but omitted from the per-deal blocks above._")
    lines.append(f"_{len(brand_records)} total Brand records paginated; deduped to {total_unique} unique Buyer Deal Pipeline deals. {excluded_pipeline} deal(s) in legacy client-named pipelines were excluded._")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_file.write_text("\n".join(lines) + "\n")
    print(f"[done] [{brand_slug}] wrote {out_file}", file=sys.stderr)

    diverged = slugify(live_brand) != brand_slug

    return {
        "brand_slug": brand_slug,
        "live_brand": live_brand,
        "diverged_from_slug": diverged,
        "this_week_deals": len(set(
            [d for d, _ in WINS_LOSSES] + [d for d, _ in STAGE_MOVES] +
            [d for d, _ in NEW_DEALS] + [d for d, _ in MEETINGS] +
            [d for d, _ in NOTABLE])),
        "wins_losses": len(WINS_LOSSES),
        "stage_moves": len(STAGE_MOVES),
        "new_deals": len(NEW_DEALS),
        "meetings": len(MEETINGS),
        "notable": len(NOTABLE),
        "still_warm": len(STILL_WARM),
        "auto_attached_only": len(AUTO_ATTACHED_ONLY),
        "collision_warnings": sum(1 for d in deals.values() if d["_ann"]["collision_warning"]),
        "stale_warnings": sum(1 for d in deals.values() if d["_ann"]["stale_warning"]),
        "total_unique_deals": total_unique,
        "brand_records_pre_dedupe": len(brand_records),
        "excluded_pipeline": excluded_pipeline,
        "out_file": str(out_file),
    }


def main():
    ap = argparse.ArgumentParser(
        description="Weekly pipeline report generator for PluginBrands clients.")
    ap.add_argument("--window-end", required=True, metavar="YYYY-MM-DD",
        help="Inclusive end of the 7-day reporting window. window_start is window_end - 7 days.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--brand", metavar="slug",
        help=f"Run one brand by slug. Known slugs: {', '.join(BRAND_SLUGS)}")
    g.add_argument("--all", action="store_true",
        help="Run all 20 brands sequentially (for parallelism, prefer multiple --brand invocations).")
    args = ap.parse_args()

    try:
        window_end_date = date.fromisoformat(args.window_end)
    except ValueError:
        print(f"error: --window-end must be YYYY-MM-DD, got {args.window_end!r}", file=sys.stderr)
        sys.exit(2)

    token = load_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    if args.brand:
        if args.brand not in BRAND_SLUGS:
            print(f"warn: {args.brand!r} not in known slug list — attempting resolve anyway", file=sys.stderr)
        stats = run_brand(args.brand, window_end_date, headers)
        print(json.dumps(stats, indent=2))
    else:
        all_stats = []
        for slug in BRAND_SLUGS:
            try:
                stats = run_brand(slug, window_end_date, headers)
            except SystemExit:
                raise
            except Exception as e:
                print(f"error: [{slug}] failed: {e}", file=sys.stderr)
                stats = {"brand_slug": slug, "error": str(e)}
            all_stats.append(stats)
            print(json.dumps(stats))
        print(json.dumps({"summary": all_stats}, indent=2))


if __name__ == "__main__":
    main()
