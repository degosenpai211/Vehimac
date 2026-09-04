from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class MechanicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    role: str = Field(default="mechanic", pattern="^(mechanic|designer)$")


class MechanicUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    active: bool | None = None
    role: str | None = Field(None, pattern="^(mechanic|designer)$")
    salary_base: Decimal | None = Field(None, ge=0)
    salary_mode: str | None = Field(None, pattern="^(fixed|per_job|both)$")
    salary_period: str | None = Field(None, pattern="^(weekly|biweekly|monthly)$")
    pay_day: int | None = Field(None, ge=0, le=31)


class MechanicResponse(BaseModel):
    id: UUID
    name: str
    active: bool
    role: str = "mechanic"
    salary_base: Decimal = Decimal("0")
    salary_mode: str = "both"
    salary_period: str = "monthly"
    pay_day: int = 30
    created_at: datetime

    class Config:
        from_attributes = True
