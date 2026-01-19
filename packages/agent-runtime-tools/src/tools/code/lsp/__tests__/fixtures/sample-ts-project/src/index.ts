export interface User {
  id: string;
  name: string;
}

export function greet(user: User): string {
  return `Hello, ${user.name}`;
}

export const message = greet({ id: "1", name: "Ada" });
