from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(default="General", max_length=100)
    quantity: int = Field(default=0, ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    category: str | None = Field(None, max_length=100)
    quantity: int | None = Field(None, ge=0)
    unit_price: Decimal | None = Field(None, ge=0)


class ProductResponse(ProductBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
