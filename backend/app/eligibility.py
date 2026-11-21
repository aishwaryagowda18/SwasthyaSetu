"""Eligibility rule engine.

Pure Python and deterministic: the same profile and rules always give the same result.
No database, no network, no AI. Missing answers give "unknown", never "fail".
"""

from collections.abc import Iterable

from app.models import (
    GroupResult,
    Outcome,
    Profile,
    Rule,
    RuleGroup,
    RuleResult,
    SchemeCheckResult,
    SchemeRules,
)


def evaluate_rule(rule: Rule, profile: Profile) -> Outcome:
    """Check one rule against the profile."""
    if rule.operator == "manual_check":
        return "unknown"  # cannot be decided from answers; confirm on the official portal

    answer = getattr(profile, rule.field)
    if answer is None:
        return "unknown"  # not answered: never treated as zero or "no"

    op, value = rule.operator, rule.value
    if op == "eq":
        passed = answer == value
    elif op == "in":
        passed = answer in value
    elif op == "not_in":
        passed = answer not in value
    elif op == "gte":
        passed = answer >= value
    elif op == "lte":
        passed = answer <= value
    elif op == "is_true":
        passed = answer is True
    elif op == "is_false":
        passed = answer is False
    else:  # unreachable: operators are validated in models.Rule
        raise ValueError(f"unsupported operator: {op}")
    return "pass" if passed else "fail"


def combine_all(outcomes: Iterable[Outcome]) -> Outcome:
    """Every item must pass. A known failure wins; otherwise unknown wins over pass."""
    outcomes = list(outcomes)
    if "fail" in outcomes:
        return "fail"
    if "unknown" in outcomes:
        return "unknown"
    return "pass"


def combine_any(outcomes: Iterable[Outcome]) -> Outcome:
    """One pass is enough. Otherwise unknown wins over fail."""
    outcomes = list(outcomes)
    if "pass" in outcomes:
        return "pass"
    if "unknown" in outcomes:
        return "unknown"
    return "fail"


def evaluate_group(group: RuleGroup, profile: Profile) -> GroupResult:
    rule_results = [
        RuleResult(
            field=rule.field,
            operator=rule.operator,
            outcome=evaluate_rule(rule, profile),
            message=rule.message,
            source_id=rule.source_id,
            page=rule.page,
            section=rule.section,
        )
        for rule in group.rules
    ]
    combine = combine_all if group.mode == "all" else combine_any
    return GroupResult(
        key=group.key,
        mode=group.mode,
        outcome=combine(r.outcome for r in rule_results),
        rules=rule_results,
    )


def evaluate_scheme(scheme: SchemeRules, profile: Profile) -> SchemeCheckResult:
    """Return one of: eligible, not_eligible, need_more_info, rules_not_verified."""
    base = {"scheme_id": scheme.scheme_id, "name": scheme.name, "version": scheme.version}

    # Unverified rules are kept separate: they are never evaluated or shown as a match.
    if not scheme.verified or not scheme.groups:
        return SchemeCheckResult(**base, result="rules_not_verified")

    groups = [evaluate_group(group, profile) for group in scheme.groups]
    overall = combine_all(g.outcome for g in groups)

    missing, manual = [], []
    if overall == "unknown":
        # Only undecided groups matter: a blank answer in a group that already passed is not needed.
        for group in (g for g in groups if g.outcome == "unknown"):
            for rule in group.rules:
                if rule.outcome != "unknown":
                    continue
                if rule.operator == "manual_check":
                    manual.append(rule.message)
                elif rule.field not in missing:
                    missing.append(rule.field)

    result = {"pass": "eligible", "fail": "not_eligible", "unknown": "need_more_info"}[overall]
    return SchemeCheckResult(
        **base, result=result, missing_fields=missing, manual_checks=manual, groups=groups
    )


def check_eligibility(profile: Profile, schemes: Iterable[SchemeRules]) -> list[SchemeCheckResult]:
    """Check a profile against each scheme, in the order given."""
    return [evaluate_scheme(scheme, profile) for scheme in schemes]
