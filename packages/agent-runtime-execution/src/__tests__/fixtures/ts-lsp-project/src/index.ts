export class AuthService {
  login(user: string): string {
    return `Hello, ${user}`;
  }
}

export function greet(name: string): string {
  return `Hello, ${name}`;
}

export const message = greet("Ada");
