import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: image().optional(),
		}),
});

const devlog = defineCollection({
	loader: glob({ base: './src/content/devlog', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		pubDate: z.coerce.date(),
		tags: z.array(z.string()).optional(),
	}),
});

export const collections = { blog, devlog };
