/**
 * Fuentes de precios. Solo las "available" estan implementadas.
 * Las demas se listan con el motivo real por el que no se integraron (investigado en oct-2026).
 */
export type PriceSource = {
  id: string;
  label: string;
  status: "available" | "unavailable";
  note: string;
};

export const PRICE_SOURCES: PriceSource[] = [
  {
    id: "manual",
    label: "Carga manual",
    status: "available",
    note: "Cargas el precio que ves en el estante; queda como confirmado por vos, con fecha.",
  },
  {
    id: "csv",
    label: "Importacion CSV",
    status: "available",
    note: "Pegas o subis un CSV (por ejemplo copiado de un volantino). Cada fila guarda fuente, fecha y vigencia.",
  },
  {
    id: "esselunga-online",
    label: "Esselunga online (catalogo)",
    status: "unavailable",
    note: "No hay API oficial publica. Solo existen servicios pagos de terceros que extraen datos del sitio; no se integraron porque no se verificaron los terminos de uso de Esselunga.",
  },
  {
    id: "iper-online",
    label: "Iper La grande i (catalogo y volantino)",
    status: "unavailable",
    note: "Sin API ni feed publico. El visor oficial de volantinos es una pagina dinamica que no se puede leer desde afuera, y los sitios que lo resumen solo muestran unas pocas ofertas destacadas. Ademas los volantinos traen solo promociones y varian por local.",
  },
  {
    id: "flyer-import",
    label: "Importacion asistida de volantinos",
    status: "unavailable",
    note: "Posible: subir o pegar las paginas del volantino y que una IA proponga los precios para revisarlos antes de importar. Requiere una clave de Anthropic en el servidor y todavia no esta construido.",
  },
  {
    id: "open-prices",
    label: "Open Prices (Open Food Facts)",
    status: "unavailable",
    note: "Base colaborativa gratuita que consulta por codigo de barras. Requiere guardar el EAN de cada producto y no esta verificada su cobertura en Italia.",
  },
];
