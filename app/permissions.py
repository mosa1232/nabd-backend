"""Roles and permissions.

Every account has a *role* (what kind of person it is) and the role gives a
default set of *permissions*. On top of that an account can carry extra
permissions granted by whoever manages it:

  admin          grants anything to staff accounts
  store_manager  grants codes.* permissions to resellers
  professor      grants prof.* permissions to their own assistants

Admins hold every permission implicitly ("*").
"""
from __future__ import annotations

import re

# permission code -> Arabic label (shown in the dashboard's permission pickers)
PERMISSIONS: dict[str, str] = {
    # staff / back-office
    "dashboard.analytics": "الإحصائيات ونظرة عامة وسجل النشاطات",
    "users.manage": "إدارة الحسابات والأدوار",
    "users.ban": "الحظر والطعون",
    "catalog.manage": "إدارة المناهج (الأقسام والجامعات والمراحل والمواد)",
    "content.manage": "المحتوى (التدريب الصيفي والإشعارات والملفات)",
    "store.manage": "المتجر (المنتجات والأقسام والطلبات)",
    "resellers.manage": "إدارة المندوبين وصلاحياتهم",
    # reseller
    "codes.view": "عرض الأكواد وسجل المبيعات",
    "codes.generate": "توليد/أخذ أكواد جديدة",
    # professor & assistant
    "prof.questions": "رفع وتعديل الأسئلة",
    "prof.exams": "إنشاء الامتحانات (الكوزات)",
    "prof.courses": "الكورسات والمحاضرات",
    "prof.booklets": "الملازم",
    "prof.pearls": "اللمحات السريرية",
    "prof.students": "مشاهدة الطلاب",
    # representative
    "rep.codes": "رفع أسماء الطلاب وتوليد أكواد التوثيق وتنزيلها",
}

STAFF_PERMS = {"dashboard.analytics", "users.manage", "users.ban", "catalog.manage",
               "content.manage", "store.manage", "resellers.manage"}
RESELLER_PERMS = {"codes.view", "codes.generate"}
REP_PERMS = {"rep.codes"}
PROF_PERMS = {"prof.questions", "prof.exams", "prof.courses", "prof.booklets", "prof.pearls", "prof.students"}

# What each role gets with no extra grants.
ROLE_DEFAULTS: dict[str, set[str]] = {
    "admin": set(PERMISSIONS),
    "supervisor": {"dashboard.analytics", "users.ban", "content.manage", "catalog.manage"},
    "store_manager": {"store.manage", "resellers.manage"},
    "reseller": set(),          # everything a reseller can do is granted per reseller
    "professor": set(PROF_PERMS),
    "assistant": set(),         # granted per assistant by their professor
    "representative": set(REP_PERMS),
    "student": set(),
}

# Roles that may open the dashboard at /admin.
DASHBOARD_ROLES = {"admin", "supervisor", "store_manager", "professor", "assistant", "reseller", "representative"}
# Roles that may use /api/admin/* (still subject to per-route permissions).
BACKOFFICE_ROLES = {"admin", "supervisor", "store_manager"}


def parse_permissions(raw: str | None) -> set[str]:
    return {p for p in (raw or "").split(",") if p in PERMISSIONS}


def serialize_permissions(perms) -> str:
    return ",".join(sorted({p for p in perms if p in PERMISSIONS}))


def effective_permissions(role, raw_extra: str | None) -> set[str]:
    role = getattr(role, "value", role)  # accept the Role enum or its string
    base = ROLE_DEFAULTS.get(role, set())
    if role == "admin":
        return set(PERMISSIONS)
    return set(base) | parse_permissions(raw_extra)


# --- /api/admin/* : which permission each route family needs. First match
# wins, so the narrow rules (ban/unban) sit above the broad ones (/users).
_ADMIN_RULES: list[tuple[re.Pattern, str]] = [(re.compile(p), perm) for p, perm in [
    (r"^/api/admin/users/[^/]+/(ban|unban)$", "users.ban"),
    (r"^/api/admin/bans(/|$)", "users.ban"),
    (r"^/api/admin/resellers(/|$)", "resellers.manage"),
    (r"^/api/admin/(users|professors)(/|$)", "users.manage"),
    (r"^/api/admin/catalog(/|$)", "catalog.manage"),
    # Questions and pearls are written by doctors/assistants, not by staff;
    # the admin API only keeps list + delete on them for moderation.
    (r"^/api/admin/(questions|pearls|summer-trainings|notifications|media|import)(/|$)", "content.manage"),
    (r"^/api/admin/store(/|$)", "store.manage"),
    (r"^/api/admin/(overview|students|weak-topics|logs|export)(/|$)", "dashboard.analytics"),
]]


def required_admin_permission(path: str) -> str | None:
    """None = no rule matched, i.e. admins only."""
    for pattern, perm in _ADMIN_RULES:
        if pattern.match(path):
            return perm
    return None
