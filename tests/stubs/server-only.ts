// Stub para o pacote "server-only", que lança erro sempre que é importado
// fora do bundler do Next.js (ele detecta o ambiente via um alias de
// webpack que só existe no build do Next). Os testes de integração rodam
// via Vitest/Node puro, então precisam desse alias apontando pra cá — ver
// `resolve.alias` em vitest.integration.config.ts. Não faz nada de
// propósito: só existe pra não quebrar o import.
export {};
