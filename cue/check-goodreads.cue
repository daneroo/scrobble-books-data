// check-goodreads.cue: goodreads.json, and each segment (one list page).
// The zod twin is apps/scrape/src/goodreads.ts; keep the two in step.
import "time"

#Goodreads

#Goodreads: close({
	userFullName: string & !=""
	items: [...#item]
})

#item: close({
	reviewId:           #Digits
	title:              string & !=""
	bookId:             #Digits
	bookURL:            =~"^https://www\\.goodreads\\.com/book/show/[0-9]+" // the title link, with its slug
	bookImageURL:       =~"^https://"
	isbn:               #ISBN | ""
	userRating:         number & >=0 & <=5 // fractional: 4.25, 4.5; 0 is unrated
	userReadAtText:     #PageDate | ""     // the newest read date, as shown
	userDateCreatedDay: #Day
	userExclusiveShelf: #ExclusiveShelf
	averageRating:      =~"^[0-9]\\.[0-9]$" // all editions, toFixed(1): 3.58 → 3.6
	bookPublishedText:  #PageDate | =~"^-?[0-9]{1,4}$" | "unknown"
	numPages:           =~"^[0-9]+$" // "0" when unknown
	userDateAddedDay!: #Day   // the review page's review date
	userReview!:       string // the review page's, as HTML; "" when none
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

#Month: "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"

#PageDate: =~"^(\(#Month) ([0-9]{2}, )?)?[0-9]{4}$" // Oct 24, 2026 | Oct 2026 | 2026
#Day:      time.Format("2006-01-02")

#TimelineDate: =~"^(.* )?[0-9]{4}$" // text ending in a year: October 23, 2026 | January, 1997 | 2021
