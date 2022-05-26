// check.cue
import "time"

#item: {
	id: string
	title: #_value
	links: [
		{href: string},
	]
	book_id:               #_value
	book_image_url:        #_value
	book_small_image_url:  #_value
	book_medium_image_url: #_value
	book_large_image_url:  #_value
	book_description?:     #_value

	book: {
		id:         string
		num_pages?: #_value
	}
	author_name:       #_value
	isbn?:             #_value
	user_name:         #_value
	user_rating:       #_value
	user_read_at?:     #_value
	user_date_added:   #_value
	user_date_created: #_value
	user_shelves?:     #_value
	user_review?:      #_value
	average_rating:    #_value
	book_published?:   #_value
	description:       #_value
	published:         #RFC3339Z
	publishedRaw:      string
	updated:           #RFC3339Z
	updatedRaw:        string
}

#RFC3339Z: time.Format("2006-01-02T15:04:05.999999Z")

#_value: {"value": string}

// Top level
"xhtml:meta": {
	"xmlns:xhtml": "http://www.w3.org/1999/xhtml"
	"name":        "robots"
	"content":     "noindex"
}
"atom:link": {
	"href": string
	"rel":  "self"
	"type": "application/rss+xml"
}
"type":          "RSS 2.0"
"id":            string
"title":         #_value
"description":   string
"created":       #RFC3339Z
"createdRaw":    string
"updateDate":    #RFC3339Z
"updateDateRaw": string
"language":      string
"copyright":     string
"ttl":           number
"links": [
	string,
]
"image": {
	"link":   string
	"title":  string
	"url":    string
	"height": number
	"width":  number
}

entries: [...#item]
