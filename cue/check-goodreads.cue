// check-goodreads.cue: goodreads.json, and each segment (one list page).
// The zod twin is apps/scrape/src/goodreads.ts; keep the two in step.
// Dates are ISO 8601 UTC; a day a page shows (US Pacific) is the start of
// that day in America/Los_Angeles, in UTC.
import "time"

#Goodreads

#Goodreads: [...#item]

#item: close({
	reviewId:           #Digits
	title:              string & !=""
	bookId:             #Digits
	bookURL:            =~"^https://www\\.goodreads\\.com/book/show/[0-9]+" // the title link, with its slug
	bookImageURL:       =~"^https://"
	isbn:               #ISBN | ""
	userRating:         number & >=0 & <=5 // fractional: 4.25, 4.5; 0 is unrated
	userAddedAt:        #Time // the list's "date added": start of that Pacific day
	userExclusiveShelf: #ExclusiveShelf
	averageRating:      =~"^[0-9]\\.[0-9]$" // all editions, toFixed(1): 4.04 → 4.0, only to avoid flapping
	bookPublished:      string // the list's "date pub", as shown
	numPages:           =~"^[0-9]+$" // "0" when unknown
	reviewUpdatedAt?:  #Time  // the book page's updatedAt of the user's review; absent when unrated and unreviewed
	userReview!:       string // the review page's, as HTML; "" when none
	bookDescription!:  string        // the book page's, as HTML
	authorName!:       string & !="" // the book page's primary contributor, as shown
	timeline!: [...#timelineRow] // the review page's, in page order, as shown
})

// One row of the reading timeline, uninterpreted.
#timelineRow: close({
	dateText: #TimelineDate | "" // "" when the row has no date
	event:    string & !=""      // "Shelved as: on-deck", "44.0%", "Started Reading (Hardcover Edition)"
})

#ExclusiveShelf: "to-read" | "currently-reading" | "read" | "did-not-finish" | "on-deck"

#Digits: =~"^[0-9]+$"
#ISBN:   =~"^[0-9X]{10}$" | =~"^[0-9X]{13}$"

#Time: time.Time & =~"Z$" // ISO 8601 UTC: 2026-11-01T07:00:00.000Z

#TimelineDate: =~"^(.* )?[0-9]{4}$" // text ending in a year: October 23, 2026 | January, 1997 | 2021
