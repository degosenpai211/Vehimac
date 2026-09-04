from datetime import date as date_type, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class FinanceType(str, Enum):
    ingreso = "ingreso"
    gasto = "gasto"


class FinanceBase(BaseModel):
    type: FinanceType
    description: str = Field(..., min_length=1)
    amount: Decimal = Field(..., gt=0)
    category: str = Field(default="General")
    date: date_type | None = None
    work_order_id: UUID | None = None
    mechanic_id: UUID | None = None
    salary_period_key: str | None = None


class FinanceCreate(FinanceBase):
    pass


class FinanceResponse(FinanceBase):
    id: UUID
    date: date_type
    created_at: datetime

    class Config:
        from_attributes = True


class FinanceSummary(BaseModel):
    period: str
    total_ingresos: Decimal
    total_gastos: Decimal
    balance: Decimal
    count_ingresos: int
    count_gastos: int


class SalaryPayCreate(BaseModel):
    mechanic_id: UUID
    period_key: str = Field(..., min_length=1, max_length=40)
    base_amount: Decimal = Field(default=Decimal("0"), ge=0)
    extra_amount: Decimal = Field(default=Decimal("0"), ge=0)
    date: date_type | None = None

    @model_validator(mode="after")
    def total_positive(self):
        if (self.base_amount or 0) + (self.extra_amount or 0) <= 0:
            raise ValueError("El pago debe ser mayor a 0")
        return self


class FinanceSettingsUpdate(BaseModel):
    cash_opening: Decimal | None = Field(None, ge=0)
    rent_1: Decimal | None = Field(None, ge=0)
    rent_2: Decimal | None = Field(None, ge=0)
