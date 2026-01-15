declare const Bun: {
  serve: (options: {
    port: number;
    fetch: (request: Request) => Response | Promise<Response>;
  }) => { port: number };
};
