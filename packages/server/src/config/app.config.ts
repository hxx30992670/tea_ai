export const appConfig = () => ({
  app: {
    port: Number(process.env.PORT ?? 3000),
  },
});
