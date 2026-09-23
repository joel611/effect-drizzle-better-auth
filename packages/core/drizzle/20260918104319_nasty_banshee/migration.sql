CREATE TABLE "task" (
	"id" serial PRIMARY KEY,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
