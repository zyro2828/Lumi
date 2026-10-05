/**
 * An error whose message is safe to show to the end user.
 * Anything that is NOT an AppError is treated as unexpected and the
 * user only sees a generic message (details stay in the server log).
 */
export class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = "AppError";
        this.status = status;
    }
}
