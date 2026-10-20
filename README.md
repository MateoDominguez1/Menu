# Smart Meal Planner

Aplicacion web personal para planificar comidas, controlar el presupuesto y hacer la compra en Esselunga o Iper con una lista interactiva pensada para el celular. Interfaz en espanol, datos y unidades del mercado italiano.

## Que hace

- **Plan de comidas** por periodo (de 1 a 14 dias, empezando cualquier dia): eliges donde comes cada dia (casa, trabajo, fuera) y genera recetas para las comidas que faltan, respetando presupuesto, tiempo de cocina, alimentos a evitar, favoritas/descartadas y lo que ya tenes en casa. Cambiar o editar una comida no regenera el resto.
- **Recetas** con ingredientes estructurados (unidades normalizadas a g, ml o unidades), porciones escalables, costo por porcion, nutricion estimada, editor, duplicado y borrado.
- **Lista de compras** calculada desde el plan, descontando la despensa, agrupada por categorias, con progreso, subtotal, modo compra de una mano, productos manuales, cantidades y precios editables, y precios estimados claramente separados de los confirmados. Se guarda sola; si falla la conexion, las marcas quedan en el telefono y se sincronizan al volver.
- **Comparador Esselunga vs Iper** con precio normalizado por kg/L/unidad, vigencia de promos, y tres estrategias (todo en una tienda, todo en la otra, dividir) con costo de desplazamiento y tiempo configurable.
- **Despensa** con ubicacion y vencimiento; se descuenta cuando marcas una comida como comida y se suma una sola vez al terminar la compra.
- **Historial** de planes, gasto estimado vs real y desvio contra el presupuesto.
- **Ajustes**: perfil, objetivos, comidas que se planifican, restricciones, ingredientes "siempre en casa", importacion de precios.

## Instalacion

Requisitos: Node 20 o superior (probado con Node 24) y npm.

```bash
npm install
npm run dev
```

Abre http://localhost:3000. La primera vez se crea la base SQLite en `data/app.db`, se aplican las migraciones y se cargan los datos iniciales. No hace falta configurar nada mas para uso local.

Scripts utiles:

| Comando | Que hace |
|---|---|
| `npm test` | Tests unitarios y de integracion (base temporal real) |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm run build` | Build de produccion |
| `npm run db:generate` | Genera una migracion nueva tras cambiar `src/db/schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | Migra / carga datos iniciales a mano |

## Variables de entorno

Copia `.env.example` a `.env.local`.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | `file:./data/app.db` (local) o `libsql://...` (Turso) |
| `DATABASE_AUTH_TOKEN` | Token de Turso |
| `APP_PASSWORD` | Si esta definida, la app pide clave. Vacia = abierta (solo para uso local) |
| `APP_SECRET` | Secreto largo para firmar la sesion |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Opcional: generacion de planes con IA en el backend |

## Despliegue (usarla en el supermercado)

Local, la app corre en tu PC. Para abrir la lista desde el celular **fuera de casa** tiene que estar publicada. Vercel no guarda archivos, asi que necesita una base libSQL (Turso, con plan gratuito).

1. En Vercel, en el proyecto: *Storage / Marketplace > Turso > Add*. Inyecta `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` (la app tambien acepta `DATABASE_URL` y `DATABASE_AUTH_TOKEN`).
2. Define `APP_PASSWORD` (la clave de acceso) y `APP_SECRET` (texto largo aleatorio).
3. Redespliega. En el primer ingreso se aplican las migraciones y se cargan los datos iniciales.
4. En el celular, abre la URL y "agregar a pantalla de inicio" (hay manifest de PWA; inicia en `/shopping`).

En produccion la app **falla cerrada**: sin `APP_PASSWORD` (o, en Vercel, sin base remota) muestra una pantalla de configuracion y no abre ningun dato. Esto aplica tambien a `npm run build && npm start` en local: define `APP_PASSWORD` para probarlo.

En la misma red wifi de casa puedes probar desde el celular con `npm run dev -- -H 0.0.0.0`.

## Arquitectura

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4.
- Drizzle ORM + libSQL: SQLite local, el mismo codigo funciona con Turso.
- Server Actions validadas con zod; cada accion llama a `requireAuth()` porque se pueden invocar por POST directo. `src/proxy.ts` hace solo una redireccion optimista a `/login`.
- `src/lib/*`: logica pura y testeable (unidades, nutricion, precios, planificador, lista de compras, plan por IA).
- `src/server/*`: acceso a datos, sincronizacion plan -> lista, acciones, importacion de precios.
- Modelo de datos relacional: perfil y reglas, tiendas, ingredientes, recetas e ingredientes de receta, productos comerciales, precios con origen/fecha/vigencia, planes y comidas, listas e items, despensa, favoritas.

Decisiones que conviene saber:
- Dinero en centimos enteros; cantidades en unidad base del ingrediente.
- La lista se reconcilia (no se regenera): conserva lo comprado, lo eliminado a mano, lo manual y las cantidades editadas.
- Los productos a granel se cobran por lo que se pesa; los envasados se redondean a envases.
- Un precio vencido nunca entra en los totales; una promo vencida deja vigente el precio habitual.
- En la comparacion, si una tienda no tiene precio de un producto, se imputa el de la otra y se marca como tal. Una tienda sin datos propios no se recomienda.

## Limitaciones reales

- **Precios**: no hay API oficial publica de Esselunga ni de Iper. Se investigo y **no se integro scraping** (solo hay servicios pagos de terceros y no se verificaron los terminos de uso). Los datos iniciales traen 7 precios con fuente y fecha reales (volantinos, paginas publicas y 2 de sitios de terceros sin confirmar; varios ya desactualizados), unos 12 estimados marcados como "estimado", y **ninguno de Iper**. Las otras fuentes aparecen en Ajustes como "no disponible" con el motivo. Funcionan la carga manual y el CSV.
- **"Iper"** es ambiguo en Italia (La grande i, Carrefour Iper, Ipercoop). Falta confirmar cual usas.
- **Nutricion**: los valores iniciales son estimaciones genericas por 100 g, no de etiqueta; se muestran siempre como estimados y las recetas con datos faltantes se marcan como incompletas.
- **IA**: el codigo existe y la validacion de la respuesta esta testeada, pero **no se probo contra la API real** (no habia clave). Sin clave, o ante cualquier respuesta invalida, se usa el motor local.
- **Sin conexion**: las marcas de compra se encolan en el telefono, pero la pagina necesita conexion para abrirse (no hay service worker).
- Acceso por una sola clave compartida; no hay multiusuario.
- El "motor local" elige entre las recetas guardadas con reglas de puntaje; no inventa recetas.
