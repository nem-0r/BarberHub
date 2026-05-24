from fastapi import status


class BarbershopException(Exception):
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code


class UserNotFoundError(BarbershopException):
    def __init__(self, message: str = "User not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class AuthenticationError(BarbershopException):
    def __init__(self, message: str = "Invalid credentials"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class PermissionDeniedError(BarbershopException):
    def __init__(self, message: str = "You do not have enough permissions"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class BookingConflictError(BarbershopException):
    def __init__(
        self, message: str = "Booking conflict: requested slot is already taken"
    ):
        super().__init__(message, status.HTTP_409_CONFLICT)


class AvailabilityError(BarbershopException):
    def __init__(self, message: str = "Staff is not available at the requested time"):
        super().__init__(message, status.HTTP_400_BAD_REQUEST)


class EmailAlreadyExistsError(BarbershopException):
    def __init__(
        self,
        message: str = (
            "This email is already registered. Try signing in instead, "
            "or use 'Sign in with Google' if the account was created via Google."
        ),
    ):
        super().__init__(message, status.HTTP_409_CONFLICT)
