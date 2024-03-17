// check.cue
import "time"

#item: {
	guid:                  #HTTPURL
	pubDate:               time.Format(time.RFC1123Z)
	title:                 string
	link:                  #HTTPURL
	book_id:               string
	book_image_url:        #HTTPURL
	book_small_image_url:  #HTTPURL
	book_medium_image_url: #HTTPURL
	book_large_image_url:  #HTTPURL
	book_description?:     string
	book: {
		// num_pages: string
		num_pages: #INTSTRING_OR_EMPTY
	}
	author_name:       string
	isbn:              #INTSTRING_OR_EMPTY | string // 125086593X
	user_name:         string
	user_rating:       #INTSTRING_OR_EMPTY
	user_read_at:      string // this should work but does not: "" | time.Format(time.RFC1123Z)
	user_date_added:   time.Format(time.RFC1123Z)
	user_date_created: time.Format(time.RFC1123Z)
	user_shelves:      string
	user_review:       string
	average_rating:    #DECIMALSTRING_OR_EMPTY
	book_published:    #INTSTRING_OR_EMPTY
	description:       string
}

// till a real stdlib url thing come along...
#HTTPURL: =~"^https?:\/\/"

// emtpy or int (negative ok)
#INTSTRING_OR_EMPTY:     "" | =~"^\\-?[0-9]+$"
#DECIMALSTRING_OR_EMPTY: "" | =~"^[0-9]+(\\.[0-9]+)?$"

// not used
#RFC3339Z: time.Format("2006-01-02T15:04:05.999999Z")

// Top level
rss: {
	channel: {
		"xhtml:meta":  ""
		title:         string
		copyright:     string
		link:          string
		"atom:link":   ""
		description:   string
		language:      string
		lastBuildDate: string
		ttl:           string
		image: {
			"title":  string
			"link":   string
			"width":  string
			"height": string
			"url":    string
		}
		item: [...#item]
	}
}
