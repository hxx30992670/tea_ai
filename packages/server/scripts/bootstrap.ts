import 'reflect-metadata';

async function bootstrap() {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');

  const app = await NestFactory.createApplicationContext(AppModule);
  await app.close();
}

void bootstrap();
