import { defineRelationsPart } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { mergeRelations } from "../merge-relations.ts";

// Stand-in for a generated schema (like better-auth's) and a feature that extends it.
const author = pgTable("author", { id: serial("id").primaryKey(), name: text("name") });
const profile = pgTable("profile", {
  authorId: integer("author_id").notNull(),
  id: serial("id").primaryKey(),
});
const post = pgTable("post", {
  authorId: integer("author_id").notNull(),
  id: serial("id").primaryKey(),
});

const generatedRelations = defineRelationsPart({ author, profile }, (r) => ({
  author: { profiles: r.many.profile({ from: r.author.id, to: r.profile.authorId }) },
  profile: { author: r.one.author({ from: r.profile.authorId, to: r.author.id }) },
}));

const featureRelations = defineRelationsPart({ author, post }, (r) => ({
  author: { posts: r.many.post({ from: r.author.id, to: r.post.authorId }) },
  post: { author: r.one.author({ from: r.post.authorId, to: r.author.id }) },
}));

describe("mergeRelations", () => {
  it("merges relations of a table defined in more than one part", () => {
    const relations = mergeRelations(generatedRelations, featureRelations);

    expect(Object.keys(relations.author.relations).toSorted()).toEqual(["posts", "profiles"]);
    expect(Object.keys(relations.profile.relations)).toEqual(["author"]);
    expect(Object.keys(relations.post.relations)).toEqual(["author"]);
  });

  it("lets a relational query use relations from both parts", () => {
    const db = drizzle.mock({ relations: mergeRelations(generatedRelations, featureRelations) });

    const query = db.query.author.findMany({ with: { posts: true, profiles: true } }).toSQL();

    expect(query.sql).toContain('"post"');
    expect(query.sql).toContain('"profile"');
  });

  it("throws when two parts define the same relation", () => {
    expect(() => mergeRelations(featureRelations, featureRelations)).toThrow(
      'Duplicate relation "author.posts"',
    );
  });
});
