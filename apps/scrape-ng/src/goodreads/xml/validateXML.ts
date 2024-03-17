import { z } from "zod";

type FeedPageType = z.infer<typeof feedPageSchema>;
export function validateXML(xmlObject: any): FeedPageType {
  // validate parsed feedPage
  const zResult = feedPageSchema.safeParse(xmlObject);

  if (!zResult.success) {
    // console.log("RSS Validation failed", zResult.error);
    throw zResult.error;
  }
  return zResult.data;
}

/**
 * validate the whole feedPage; i.e. the output of parseXML(rss-page.xml)
 * <xml/>
 *   <rss>
 *     <channel>
 *      .. channel elements
 *      <item/>* multiple item elements
 *     </channel>
 *    </rss>
 */

const bookImageSchema = z.object({
  title: z.string(),
  link: z.string(),
  width: z.string(),
  height: z.string(),
  url: z.string(),
});

const bookSchema = z.object({
  num_pages: z.string(),
});

export const itemSchema = z.object({
  guid: z.string(),
  pubDate: z.string(), // ignore pubDate, it is always be equal to user_date_added
  title: z.string(),
  link: z.string(),
  book_id: z.string(),
  book_image_url: z.string(),
  book_small_image_url: z.string(),
  book_medium_image_url: z.string(),
  book_large_image_url: z.string(),
  book_description: z.string(),
  book: bookSchema,
  author_name: z.string(),
  isbn: z.string(),
  user_name: z.string(),
  user_rating: z.string(),
  user_read_at: z.string(),
  user_date_added: z.string(),
  user_date_created: z.string(),
  user_shelves: z.string(),
  user_review: z.string(),
  average_rating: z.string(),
  book_published: z.string(),
  description: z.string(),
});

const channelSchema = z.object({
  "xhtml:meta": z.string(),
  title: z.string(),
  copyright: z.string(),
  link: z.string(),
  "atom:link": z.string(),
  description: z.string(),
  language: z.string(),
  lastBuildDate: z.string(),
  ttl: z.string(),
  image: bookImageSchema,
  item: z.array(itemSchema).optional(), // Make 'item' optional
});

const rssSchema = z.object({
  channel: channelSchema,
});

export const feedPageSchema = z.object({
  // "?xml": z.string(), // ignoreDeclaration:true
  rss: rssSchema,
});
