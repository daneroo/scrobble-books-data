// check-output.cue
import "time"

title: string
items: [...#item]

#item: {
	guid:            string
	pubDate:         #RFC3339Z
	title:           string
	link:            string
	bookId:          string
	bookImageURL:    string
	bookDescription: string
	authorName:      string
	isbn:            #ISBN | ""
	userName:        string
	userRating:      #UserRating
	userReadAt:      #RFC3339Z | ""
	userDateAdded:   #RFC3339Z
	userDateCreated: #RFC3339Z
	userShelves:     #Shelves
	userReview:      string
	averageRating:   #AvgRating
	bookPublished:   #Year | ""
	description:     string
	numPages:        #NumPages
}

#Shelves:    "" | "currently-reading" | "to-read" | "on-deck" // "read" should replace ""
#UserRating: "0" | "1" | "2" | "3" | "4" | "5"

#AvgRating: =~"[0-9].[0-9]{1,2}$" // 0.0, 4.75

#NumPages: =~"^[0-9]{1,4}$" // 0-9999

#Year:     =~"^-?[0-9]+$" // includes negative years, which time.Format does not
#RFC3339Z: time.Format("2006-01-02T15:04:05.999999Z")

#ISBN: =~"^[0-9X]{10}$" | =~"^[0-9X]{13}$" // 10 or 13 digits

//  O'Reilly Regular Expressions Cookbook, 2nd edition
// https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch04s13.html
// #ISBN: =~"^(?:ISBN(?:-13)?:?\ )?(?=[0-9]{13}$|(?=(?:[0-9]+[-\ ]){4})[-\ 0-9]{17}$)97[89][-\ ]?[0-9]{1,5}[-\ ]?[0-9]+[-\ ]?[0-9]+[-\ ]?[0-9]$"
