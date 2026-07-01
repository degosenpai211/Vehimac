from datetime import date as date_type, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


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
