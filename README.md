# Panel Century 21 Innova

Panel administrativo, backend y motor de asignación de leads para
Century 21 Innova. Next.js (App Router) + Prisma + Neon PostgreSQL, con
integración directa a EasyBroker, ManyChat y OpenAI.

Ver **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** para la arquitectura
completa, el motor de asignación, y las variables de entorno.

## Primeros pasos

```bash
npm install
cp .env.example .env.local   # completa los valores reales
npx prisma migrate deploy    # aplica las migraciones contra tu DATABASE_URL
npm run db:seed              # crea la Company y el primer usuario ADMIN
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Suite de pruebas (Vitest) |
| `npm run db:seed` | Siembra la Company y el primer ADMIN |

## Estructura

- `app/` — páginas del panel y route handlers (API, webhooks).
- `lib/services/` — lógica de negocio (motor de asignación, leads, asesores, usuarios).
- `lib/repositories/` — acceso a datos vía Prisma.
- `lib/integrations/` — clientes de EasyBroker, ManyChat y OpenAI.
- `prisma/schema.prisma` — modelo de datos.
- `docs/` — arquitectura y documentación operativa.
