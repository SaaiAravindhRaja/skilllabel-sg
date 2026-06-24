from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"
FRAMEWORK = DOWNLOADS / "jobsandskills-skillsfuture-skills-framework-dataset.xlsx"
UNIQUE_SKILLS = DOWNLOADS / "jobsandskills-skillsfuture-unique-skills-list.xlsx"
MAPPING = DOWNLOADS / "jobsandskills-skillsfuture-tsc-to-unique-skills-mapping.xlsx"
OUT = ROOT / "public" / "skilllabel-data.json"
DETAIL_ROLE_PATTERNS = (
    "artificial intelligence",
    "business analyst",
    "data analyst",
    "data scientist",
    "sustainability",
    "carbon",
    "marketing executive",
    "quality control manager",
    "quality assurance and quality control manager",
)


def clean(value) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def clip(value, limit=220) -> str:
    text = clean(value)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def boolish(value) -> bool:
    return str(value).strip().lower() == "true"


def role_id(sector: str, track: str, role: str) -> str:
    return f"{sector} | {track} | {role}"


def keep_detail_role(rid: str) -> bool:
    lower = rid.lower()
    return any(pattern in lower for pattern in DETAIL_ROLE_PATTERNS)


def sample(items, limit=4):
    seen = []
    for item in items:
        text = clean(item)
        if text and text not in seen:
            seen.append(text)
        if len(seen) >= limit:
            break
    return seen


def main() -> None:
    for path in [FRAMEWORK, UNIQUE_SKILLS, MAPPING]:
        if not path.exists():
            raise FileNotFoundError(path)

    roles_df = pd.read_excel(FRAMEWORK, sheet_name="Job Role_Description")
    tasks_df = pd.read_excel(FRAMEWORK, sheet_name="Job Role_CWF_KT")
    role_skills_df = pd.read_excel(FRAMEWORK, sheet_name="Job Role_TCS_CCS")
    key_df = pd.read_excel(FRAMEWORK, sheet_name="TSC_CCS_Key")
    ka_df = pd.read_excel(FRAMEWORK, sheet_name="TSC_CCS_K&A")
    unique_df = pd.read_excel(UNIQUE_SKILLS, sheet_name="Unique Skills List")
    mapping_df = pd.read_excel(MAPPING, sheet_name="data")

    unique_by_title = {}
    for row in unique_df.to_dict("records"):
        title = clean(row.get("skill_title"))
        if not title:
            continue
        unique_by_title[title.lower()] = {
            "title": title,
            "description": clip(row.get("skill_description"), 220),
            "type": clean(row.get("skill_type")),
            "emerging": boolish(row.get("Emerging Skills")),
            "casl": boolish(row.get("CASL Skills")),
        }

    key_by_code = {}
    for row in key_df.to_dict("records"):
        code = clean(row.get("TSC Code"))
        if code:
            key_by_code[code] = {
                "category": clean(row.get("TSC_CCS Category")),
                "description": clean(row.get("TSC_CCS Description")),
                "title": clean(row.get("TSC_CCS Title")),
            }

    mapping_by_code = {}
    mapping_by_title_level = {}
    changed_mappings = []
    for row in mapping_df.to_dict("records"):
        code = clean(row.get("skills_framework_skill_code"))
        title = clean(row.get("skills_framework_skill_title"))
        level = clean(row.get("skills_framework_skill_pl"))
        previous_title = clean(row.get("Unique skill_previous_skill_title"))
        updated_title = clean(row.get("Unique skill_updated_skill_title"))
        mapped = {
            "frameworkTitle": title,
                "frameworkDescription": clip(row.get("skills_framework_skill_desc"), 220),
            "level": level,
            "levelDescription": clip(row.get("skills_framework_pl_desc"), 180),
            "previousTitle": previous_title,
            "updatedTitle": updated_title or previous_title or title,
            "updatedDescription": clip(row.get("Unique skill_updated_skill_desc"), 220),
            "sfs": boolish(row.get("Unique skill_updated_skill_SFS_status")),
            "casl": boolish(row.get("Unique skill_updated_CASL_status")),
            "type": clean(row.get("Unique skill_updated_skill_type")),
        }
        if code:
            mapping_by_code[code] = mapped
        if title and level:
            mapping_by_title_level[(title.lower(), level)] = mapped
        if previous_title and updated_title and previous_title.lower() != updated_title.lower():
            changed_mappings.append(
                {
                    "frameworkTitle": title,
                    "previousTitle": previous_title,
                    "updatedTitle": updated_title,
                    "level": level,
                }
            )

    ka_groups = defaultdict(lambda: {"knowledge": [], "ability": [], "knowledgeCount": 0, "abilityCount": 0})
    for row in ka_df.to_dict("records"):
        code = clean(row.get("TSC_CCS Code"))
        classification = clean(row.get("Knowledge / Ability Classification")).lower()
        item = clean(row.get("Knowledge / Ability Items"))
        if not code or not item:
            continue
        if classification == "knowledge":
            ka_groups[code]["knowledgeCount"] += 1
            if len(ka_groups[code]["knowledge"]) < 1:
                ka_groups[code]["knowledge"].append(clip(item, 180))
        elif classification == "ability":
            ka_groups[code]["abilityCount"] += 1
            if len(ka_groups[code]["ability"]) < 1:
                ka_groups[code]["ability"].append(clip(item, 180))

    task_groups = defaultdict(lambda: {"tasks": [], "count": 0, "cwfs": set()})
    for row in tasks_df.to_dict("records"):
        sector = clean(row.get("Sector"))
        track = clean(row.get("Track"))
        role = clean(row.get("Job Role"))
        rid = role_id(sector, track, role)
        task = clean(row.get("Key Tasks"))
        cwf = clean(row.get("Critical Work Function"))
        if cwf:
            task_groups[rid]["cwfs"].add(cwf)
        if task:
            task_groups[rid]["count"] += 1
            if len(task_groups[rid]["tasks"]) < 3 and task not in task_groups[rid]["tasks"]:
                task_groups[rid]["tasks"].append(clip(task, 180))

    role_description = {}
    for row in roles_df.to_dict("records"):
        sector = clean(row.get("Sector"))
        track = clean(row.get("Track"))
        role = clean(row.get("Job Role"))
        rid = role_id(sector, track, role)
        role_description[rid] = {
            "description": clip(row.get("Job Role Description"), 240),
            "performance": clip(row.get("Performance Expectation"), 180),
        }

    skill_rows_by_role = defaultdict(list)
    for row in role_skills_df.to_dict("records"):
        sector = clean(row.get("Sector"))
        track = clean(row.get("Track"))
        role = clean(row.get("Job Role"))
        rid = role_id(sector, track, role)
        title = clean(row.get("TSC_CCS Title"))
        code = clean(row.get("TSC_CCS Code"))
        level = clean(row.get("Proficiency Level"))
        if title:
            skill_rows_by_role[rid].append(
                {
                    "title": title,
                    "code": code,
                    "level": level,
                    "type": clean(row.get("TSC_CCS Type")),
                }
            )

    role_profiles = []
    for rid, skill_rows in skill_rows_by_role.items():
        sector, track, role = rid.split(" | ", 2)
        detailed = keep_detail_role(rid)
        deduped = {}
        for item in skill_rows:
            key = (item["title"], item["code"], item["level"])
            deduped[key] = item

        skills = []
        emerging_count = 0
        casl_count = 0
        knowledge_count = 0
        ability_count = 0

        for item in sorted(deduped.values(), key=lambda x: (x["title"], x["level"], x["code"])):
            code = item["code"]
            title = item["title"]
            level = item["level"]
            mapped = mapping_by_code.get(code) or mapping_by_title_level.get((title.lower(), level), {})
            updated_title = clean(mapped.get("updatedTitle")) or title
            unique = unique_by_title.get(updated_title.lower()) or unique_by_title.get(title.lower()) or {}
            key_info = key_by_code.get(code, {})
            ka = ka_groups.get(code, {})
            emerging = bool(unique.get("emerging")) or boolish(mapped.get("sfs")) and "data" in updated_title.lower()
            casl = bool(unique.get("casl")) or bool(mapped.get("casl"))
            emerging_count += int(emerging)
            casl_count += int(casl)
            knowledge_count += int(ka.get("knowledgeCount", 0))
            ability_count += int(ka.get("abilityCount", 0))
            description = ""
            level_description = ""
            knowledge = []
            ability = []
            if detailed:
                description = clean(mapped.get("updatedDescription")) or clean(key_info.get("description")) or clean(mapped.get("frameworkDescription"))
                level_description = clean(mapped.get("levelDescription"))
                knowledge = ka.get("knowledge", [])
                ability = ka.get("ability", [])
            previous_title = clean(mapped.get("previousTitle"))
            if previous_title.lower() == updated_title.lower():
                previous_title = ""
            skills.append(
                {
                    "title": title,
                    "updatedTitle": updated_title,
                    "code": code,
                    "level": level,
                    "type": item["type"],
                    "category": clean(key_info.get("category")) if detailed else "",
                    "description": clip(description, 220),
                    "levelDescription": clip(level_description, 180),
                    "emerging": emerging,
                    "casl": casl,
                    "previousTitle": previous_title,
                    "knowledge": knowledge,
                    "ability": ability,
                    "knowledgeCount": int(ka.get("knowledgeCount", 0)),
                    "abilityCount": int(ka.get("abilityCount", 0)),
                }
            )

        task_info = task_groups.get(rid, {})
        desc = role_description.get(rid, {})
        role_profiles.append(
            {
                "id": rid,
                "sector": sector,
                "track": track,
                "role": role,
                "description": desc.get("description", "") if detailed else "",
                "performance": desc.get("performance", "") if detailed else "",
                "tasks": task_info.get("tasks", []) if detailed else [],
                "taskCount": int(task_info.get("count", 0)),
                "criticalWorkFunctionCount": len(task_info.get("cwfs", set())),
                "skillCount": len(skills),
                "emergingCount": emerging_count,
                "caslCount": casl_count,
                "knowledgeCount": knowledge_count,
                "abilityCount": ability_count,
                "skills": skills,
            }
        )

    role_profiles.sort(key=lambda r: (r["sector"], r["track"], r["role"]))

    default_id = next(
        (
            r["id"]
            for r in role_profiles
            if r["sector"] == "Infocomm Technology"
            and r["track"] == "Strategy and Governance"
            and r["role"] == "Business Analyst / Artificial Intelligence Translator"
        ),
        role_profiles[0]["id"],
    )

    data = {
        "metadata": {
            "sourceFiles": [FRAMEWORK.name, UNIQUE_SKILLS.name, MAPPING.name],
            "sectors": int(roles_df["Sector"].nunique()),
            "sectorTracks": int(roles_df[["Sector", "Track"]].drop_duplicates().shape[0]),
            "roleRows": int(len(roles_df)),
            "roleTaskRows": int(len(tasks_df)),
            "roleSkillRows": int(len(role_skills_df)),
            "skillCodeRows": int(len(key_df)),
            "knowledgeAbilityRows": int(len(ka_df)),
            "uniqueSkillTitles": int(unique_df["skill_title"].nunique()),
            "emergingSkills": int(unique_df["Emerging Skills"].astype(str).str.lower().eq("true").sum()),
            "caslSkills": int(unique_df["CASL Skills"].astype(str).str.lower().eq("true").sum()),
            "changedMappingRows": len(changed_mappings),
        },
        "defaultRoleId": default_id,
        "sampleInput": """AI for Business Leaders\n- prompt engineering\n- dashboards and data storytelling\n- AI strategy and use cases\n- ethics overview\n- stakeholder alignment workshop\n- final presentation""",
        "changedMappings": changed_mappings[:30],
        "roles": role_profiles,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"Roles: {len(role_profiles)}")
    print(f"Default role: {default_id}")
    print(f"Size: {OUT.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
