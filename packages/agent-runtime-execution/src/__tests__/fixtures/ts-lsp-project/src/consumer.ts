import { AuthService, greet } from "./index";

const service = new AuthService();

export const response = greet("Turing");
export const welcome = service.login("Alan");
