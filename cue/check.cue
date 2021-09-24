// check.cue
import ()

#_declaration: {
	"_attributes": {
		"version":  "1.0"
		"encoding": "UTF-8"
	}
}

#_text: {"_text": string}
#_textopt: {"_text"?: string}
#_cdata: {"_cdata": string}
#_cdataopt: {"_cdata"?: string}

"_declaration": #_declaration
rss: {
	_attributes: {
		version: string
		xmlns: atom: string
	}
	channel: {
		"xhtml:meta": {
			_attributes: {
				"xmlns:xhtml": string
				name:          string
				content:       string
			}
		}
		"title":     #_text
		"copyright": #_cdata
		"link":      #_cdata
		"atom:link": {
			"_attributes": {
				"href": string
				"rel":  string
				"type": string
			}
		}
		"description":   #_cdata
		"language":      #_text
		"lastBuildDate": #_text
		"ttl":           #_text
		"image": {
			"title":  #_text
			"link":   #_cdata
			"width":  #_text
			"height": #_text
			"url":    #_text
		}
		item: [...{
			guid:                  #_cdata
			pubDate:               #_cdata
			title:                 #_cdata | #_text
			link:                  #_cdata
			book_id:               #_text
			book_image_url:        #_cdata
			book_small_image_url:  #_cdata
			book_medium_image_url: #_cdata
			book_large_image_url:  #_cdata
			book_description:      #_cdataopt
			book: {
				_attributes: id: string
				num_pages: #_textopt
			}
			author_name: #_text
			isbn: {}
			user_name:   #_text
			user_rating: #_text
			user_read_at: {}
			user_date_added:   #_cdata
			user_date_created: #_cdata
			user_shelves:      #_textopt
			user_review: {}
			average_rating: #_text
			book_published: #_textopt
			description:    #_cdata
		}]
	}
}
