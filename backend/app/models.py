"""Data shapes for eligibility checks.

Pydantic validates every input. Profile fields are all optional:
a missing field means "not answered", never zero or "no".
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator

# ----- Allowed values -----

Gender = Literal["female", "male", "other"]
AreaType = Literal["rural", "urban"]
SocialCategory = Literal["general", "obc", "sc", "st", "ews"]
Occupation = Literal[
    "farmer", "construction_worker", "daily_wage_worker", "salaried", "self_employed",
    "student", "homemaker", "unemployed", "retired", "other",
]
State = Literal[
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
    "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
    "Lakshadweep", "Puducherry",
]

ProfileField = Literal[
    "age", "gender", "state", "area_type", "annual_family_income", "social_category",
    "occupation", "has_disability", "is_pregnant_or_lactating", "has_tb_diagnosis",
]
NUMBER_FIELDS = {"age", "annual_family_income"}
YES_NO_FIELDS = {"has_disability", "is_pregnant_or_lactating", "has_tb_diagnosis"}
# Sensitive health answers: asked only when a scheme needs them; never stored or logged.
SENSITIVE_FIELDS = {"is_pregnant_or_lactating", "has_tb_diagnosis"}

Operator = Literal["eq", "in", "not_in", "gte", "lte", "is_true", "is_false", "manual_check"]
Outcome = Literal["pass", "fail", "unknown"]
SchemeResult = Literal["eligible", "not_eligible", "need_more_info", "rules_not_verified"]


# ----- Input: the user's answers -----

class Profile(BaseModel):
    """Answers for one eligibility check. Processed in memory only; never stored."""

    model_config = ConfigDict(extra="forbid")  # unknown fields are rejected

    age: Annotated[StrictInt, Field(ge=0, le=120)] | None = None
    gender: Gender | None = None
    state: State | None = None
    area_type: AreaType | None = None
    annual_family_income: Annotated[StrictInt, Field(ge=0, le=100_000_000)] | None = None
    social_category: SocialCategory | None = None
    occupation: Occupation | None = None
    has_disability: StrictBool | None = None
    is_pregnant_or_lactating: StrictBool | None = None
    has_tb_diagnosis: StrictBool | None = None


# ----- Rules -----

class Rule(BaseModel):
    """One eligibility condition, with the official source it comes from."""

    model_config = ConfigDict(extra="forbid")

    field: ProfileField | None = None  # not used by manual_check
    operator: Operator
    value: StrictInt | str | list[str] | None = None
    message: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    page: Annotated[StrictInt, Field(ge=1)] | None = None
    section: str | None = None

    @model_validator(mode="after")
    def check_rule(self) -> "Rule":
        if self.page is None and not self.section:
            raise ValueError("a rule needs a source page or section")
        op, field, value = self.operator, self.field, self.value
        if op == "manual_check":
            if field is not None or value is not None:
                raise ValueError("manual_check takes no field or value")
            return self
        if field is None:
            raise ValueError(f"{op} needs a field")
        if op in ("gte", "lte"):
            if field not in NUMBER_FIELDS or not isinstance(value, int):
                raise ValueError(f"{op} needs a number field and a whole-number value")
        elif op in ("is_true", "is_false"):
            if field not in YES_NO_FIELDS or value is not None:
                raise ValueError(f"{op} needs a yes/no field and no value")
        elif op in ("in", "not_in"):
            if field in NUMBER_FIELDS | YES_NO_FIELDS or not isinstance(value, list) or not value:
                raise ValueError(f"{op} needs a text field and a non-empty list")
        elif op == "eq":
            if field in NUMBER_FIELDS | YES_NO_FIELDS or not isinstance(value, str):
                raise ValueError("eq needs a text field and a text value")
        return self


class RuleGroup(BaseModel):
    """Rules that combine together: 'all' must pass, or 'any' one is enough."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    mode: Literal["all", "any"]
    rules: list[Rule] = Field(min_length=1)


class SchemeRules(BaseModel):
    """One version of a scheme's eligibility rules."""

    model_config = ConfigDict(extra="forbid")

    scheme_id: str
    name: str
    version: int = Field(ge=1)
    verified: bool  # only verified rule sets can produce eligibility results
    groups: list[RuleGroup] = []


# ----- Output -----

class RuleResult(BaseModel):
    field: ProfileField | None
    operator: Operator
    outcome: Outcome
    message: str
    source_id: str
    page: int | None
    section: str | None


class GroupResult(BaseModel):
    key: str
    mode: Literal["all", "any"]
    outcome: Outcome
    rules: list[RuleResult]


class SchemeCheckResult(BaseModel):
    scheme_id: str
    name: str
    version: int
    result: SchemeResult
    missing_fields: list[ProfileField] = []  # answers that would help decide
    manual_checks: list[str] = []  # conditions to confirm on the official portal
    groups: list[GroupResult] = []  # empty when rules are not verified


class EligibilityResponse(BaseModel):
    disclaimer: str
    sample_data: bool  # true while only test rules are loaded
    results: list[SchemeCheckResult]
