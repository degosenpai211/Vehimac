from dataclasses import dataclass


@dataclass(frozen=True)
class AuthIdentity:
    id: str
    email: str
    name: str


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str
    name: str
    role: str
    active: bool

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "active": self.active,
        }
