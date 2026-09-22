export const CATEGORIAS = [
  "Comida",
  "Super",
  "Transporte",
  "Salud",
  "Hogar",
  "Ocio",
  "Ropa",
  "Servicios",
  "Otros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];
