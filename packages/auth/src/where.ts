import type { CleanedWhere } from "better-auth/adapters";
import {
  and,
  Column,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  is,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

const escapeLike = (value: string) => value.replaceAll(/[\\%_]/gu, "\\$&");

const patterns = {
  contains: (text: string) => `%${text}%`,
  ends_with: (text: string) => `%${text}`,
  starts_with: (text: string) => `${text}%`,
};

const comparisons = { gt, gte, lt, lte };

export const columnOf = (table: PgTable, field: string) => {
  const column = (table as unknown as Record<string, unknown>)[field];
  if (!is(column, Column)) {
    throw new Error(`Unknown field "${field}" in auth table`);
  }
  return column;
};

const listCondition = (
  column: Column,
  where: CleanedWhere,
  values: unknown
) => {
  if (!Array.isArray(values)) {
    throw new TypeError(
      `Operator "${where.operator}" on "${where.field}" needs an array`
    );
  }
  const negate = where.operator === "not_in";
  if (
    where.mode === "insensitive" &&
    values.every((v) => typeof v === "string")
  ) {
    const operand = sql`lower(${column})`;
    const lowered = values.map((v: string) => v.toLowerCase());
    return negate ? notInArray(operand, lowered) : inArray(operand, lowered);
  }
  return negate ? notInArray(column, values) : inArray(column, values);
};

const equalityCondition = (column: Column, where: CleanedWhere): SQL => {
  const { value } = where;
  const insensitive = where.mode === "insensitive" && typeof value === "string";
  if (where.operator === "ne") {
    if (value === null) {
      return isNotNull(column);
    }
    return insensitive
      ? sql`lower(${column}) <> lower(${value})`
      : ne(column, value);
  }
  if (value === null) {
    return isNull(column);
  }
  return insensitive
    ? sql`lower(${column}) = lower(${value})`
    : eq(column, value);
};

const conditionOf = (table: PgTable, where: CleanedWhere): SQL => {
  const column = columnOf(table, where.field);
  const operator = where.operator ?? "eq";

  if (operator === "in" || operator === "not_in") {
    return listCondition(column, where, where.value);
  }
  if (operator in patterns) {
    const pattern = patterns[operator as keyof typeof patterns](
      escapeLike(String(where.value))
    );
    return where.mode === "insensitive"
      ? ilike(column, pattern)
      : like(column, pattern);
  }
  if (operator in comparisons) {
    return comparisons[operator as keyof typeof comparisons](
      column,
      where.value
    );
  }
  if (operator === "eq" || operator === "ne") {
    return equalityCondition(column, where);
  }
  throw new Error(`Unsupported where operator "${operator}"`);
};

export const whereClause = (
  table: PgTable,
  where: CleanedWhere[] | undefined
): SQL | undefined => {
  if (!where?.length) {
    return undefined;
  }
  const ands = where
    .filter((w) => w.connector !== "OR")
    .map((w) => conditionOf(table, w));
  const ors = where
    .filter((w) => w.connector === "OR")
    .map((w) => conditionOf(table, w));
  return and(...ands, ors.length ? or(...ors) : undefined);
};
