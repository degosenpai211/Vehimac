from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MechanicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    role: str = Field(default="mechanic", pattern="^(mechanic|designer)$")


class MechanicUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    active: bool | None = None
    role: str | None = Field(None, pattern="^(mechanic|designer)$")


class MechanicResponse(BaseModel):
    id: UUID
    name: str
    active: bool
    role: str = "mechanic"
    created_at: datetime

    class Config:
        from_attributes = True
