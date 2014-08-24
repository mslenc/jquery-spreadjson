jquery-spreadjson
=================

TL;DR: take JSON, stuff it into DOM. Specify the mapping by:

* using CSS classes that match JSON field names

    ```html
    <!-- sets content to json.author.name -->
    <span class=".author-name"></span>
    ```
    
* using `data-js` attributes

    ```html
    <!-- sets content to json.author.name and 
         href attribute to mailto(json.author.email) -->
    <a data-js="author.name,@href=author.email|mailto"></a>
    ```
    
* listing explicit mapping rules in JS (basically field-->selector + goodies)
    ```js
    spreader.add({
        'author.name': '.author h4',
        'author.email': { '.author a.contact@href': mailto },
        'author?': '.author-container::show()'
    });
    ```

Motivation
----------

My motivation for writing this is that I'm working on a product which can
render most everything server-side, which is pretty cool for search
engines, accessibility, Javascript-averse users etc., and also for 
our frontend developers - our template engine is way beyond anything I 
know in terms of making most stuff very easy to do. 

However, when we can use Javascript, we can offer a better experience 
compared to page reloads (or nothing), so we want to do that, too. But
then, it's quite a drag to actually do the page updates, especially 
because all JS template engines seem to assume an all-or-nothing approach, 
and messing directly with DOM with jQuery is boring and error-prone.

So, the aim is this:

* given some pre-existing HTML DOM (either already populated or empty)
* plus some JSON obtained at various times during the page visit
* make it as easy as possible to move content from the JSON to the DOM


Top-level overview
------------------

1. You create a spreader object.
2. You add actions to it. Actions match something in JSON documents, find 
   corresponding nodes in DOM, then do something  with the two (typically, 
   set the contents to the JSON value).
3. When you have the JSON ready, you give it and a container to the spreader, 
   which then does its thing.

A single spreader object can be used multiple times, with either different 
JSON data, a different container, or both.

You can also use it just one time and there are several conveniences built-in 
for that. And, as mentioned on top, rule building can also be done by either 
pulling rules from `data-js` attributes or by creating them from the JSON
(creating them from `class` attributes would be a bad idea, because
everything that didn't exist in JSON would be deleted, but also because
it's very common to have multiple classes and choosing between them 
would make things very non-simple)

### How its thing is done

When the spreader is given JSON, you can think of it as walking the JSON tree,
then calling actions with the data it finds. The path inside the tree 
determines which actions will be called, and the value they're provided
with is always the JSON value (or subtree or array) at that path. For example, 
if you had JSON like this:

```js
var json = {
    "id": 123,
    "child": {
        "prop1": "val1",
        "prop2": "val2"
    },
    "tags": [ "tag", "another" ]
}
```

Then, conceptually, something like this would happen:

```js
// assuming callActions(match, data) finds actions and then calls them with data
callActions("", json);
callActions("id", 123); // json.id
callActions("child", { "prop1": "val1", "prop2": "val2" }); // json.child
callActions("child.prop1", "val1"); // json.child.prop1
callActions("child.prop2", "val2"); // json.child.prop2
callActions("tags", [ "tag", "another" ]); // json.tags
```

So that's kind of what's going on, except it's in reverse - all actions get 
called regardless of the JSON, and each pulls in the data it needs. This is so 
because of two things:

* usually, JSON received from some API has much more data than is actually 
  displayed, so it would be fairly inefficient to walk all of it
* in many cases, it's very useful if the action is called even when there is no
  data (or, in the case of hiding stuff or showing something else, *especially*
  when there is no data)

One thing that's also missing above is that the container is passed around.
It is.

#### What about arrays?

I guess paths (to match actions) could be constructed for those as well, but I
can't think of a single non-contrived use case where you'd want to match, say, 
the third element in some list. So, if indexes were put in paths, then rules 
matching would have to include support for wildcards.

But then, it still wouldn't be very useful, because most lists have some 
unknown length, so you couldn't pre-prepare the DOM. And even if you could
(if the length were known), the rule would end up something like this in most 
cases:

```js
{ "tags.*": ".container span:nth-child($num)" }
```

It just seems silly and slow, so (conceptual) walking simply stops when an array
is encountered. Then, some utility actions are provided that allow you to
"go in" and still do stuff.


API reference
=============

## $.spreadJson

Creates a new spreader object and/or applies it. There are several ways of using
it, listed below. All of them return the spreader object, so you can't chain 
other jQuery calls after spreadJson, but you can chain spreader calls (which is
mostly useful with `add()`).


#### $.spreadJson()
Creates a new spreader object with no rules

#### $.spreadJson(rules)
Shortcut for `$.spreadJson().add(rules)`

#### $.spreadJson(rules, json)
Shortcut for `$.spreadJson().add(rules).spread(json, $(document))`

#### $.spreadJson(rules, json, container)
Shortcut for `$.spreadJson().add(rules).spread(json, container);`

#### $("selector").spreadJson(rules, json)
Shortcut for `$.spreadJson().add(rules).spread(json, $("selector"))`

#### $("selector").spreadJson(spreader, json)
Alternative form of `spreader.spread(json, $("selector"))`

#### $("selector").spreadJson(json)
Useful for the simplest cases. It walks the json, and constructs rules for
fields it finds by mapping them to CSS classes. Doesn't work with data 
involving arrays. For example:

```js
var json = {
    title: "Title",
    author: {
        "name": "John Smith",
        "email": "john@example.com"
    }
};
$("#post").spreadJson(json);
```

is equivalent to:

```js
var json = ...;
$.spreadJson({
    "name": ".name",
    "author.name": ".author-name",
    "author.email": ".author-email"
}).spread(json, $("#post"));
```

## spreader.add

This guy adds one or more rules to the spreader, then returns it so you can add
some more. The "core" form is this:

#### spreader.add("json.path", function(data, container))

The callback will be called on every `spread()` call. The data it receives will
be either whatever is there in JSON, or if nothing is there, `undefined`. 
The container will always be a jQuery object containing at most one element.

In addition to a function, you can pass all sorts of other stuff in, see below.

#### spreader.add({ path: action, path2: action2, ... })

If you pass in an object, `add(path, action)` will be called with all the 
propeties of the object. This is the most common way of setting multiple rules
at once.

#### spreader.add([ { path: action, ...}, "...", [...], ...])

If you pass in an array, `add()` will be called with each element of the array,
recursively. What else can it do?

#### spreader.add("json.path", [ action1, action2, ... ])
#### spreader.add("json.path", action1, action2, ... )

If the actions are an array, the result is the same as if you added each one
separately for the same path. Same thing if you provide more than one action as
arguments. Basically, if the first argument is a string, the rest are actions,
and arrays are unpacked, recursively.

#### spreader.add("json.path?", action)

Causes the action to be called only if data is truthy (which mostly matches
Javascript's notion, except for empty arrays). Very similar to

```js
spreader.add("json.path", function(data, container) {
    if (data)
        action(data, container);
});
```

Except for not executing on empty arrays, the point of this is that `action` 
doesn't have to be function, but can be any of the other action specifications.

#### spreader.add("json.path!", action)

The opposite of the previous case, causes the action to happen only if data is
falsy. In addition, it (the data) will be transformed into an empty string 
before being passed to actions. Useful for hiding elements and/or setting 
content to empty string instead of a `0` or `false` or `null` or `undefined`.

#### spreader.add("json.path?!", action)

Calls the action in every case, but transforms falsy values into the empty 
string. Sometimes, you do want a want a `0`..

#### spreader.add("json.path[]", { array handler })

Used for handling arrays. See below.

#### spreader.add("json.path")

Converts the path into a CSS class by replacing dots with dashes and prepending 
another dot. Then uses that as the action, so the call above is equivalent to

```js
spreader.add("json.path", ".json-path")
```


## spreader.spread

This method finally does the spreading. Actions will be executed in the order
specified.

#### spreader.spread(json, $("selector"))
#### spreader.spread(json, "selector")

Two equivalent ways of doing the spreading. If the selector matches more than
one element (which it shouldn't really), the first one will be used. If it 
matches zero elements, well.. nothing much will likely happen, except if you're 
doing something else entirely (all custom callbacks will still run, for
example; so will all the rest, except most won't actually do anything because
there's nothing to work on).

#### spreader.spread(json)

If the container is not passed in, `$(document)` is used.

## spreader.makeCallback

#### spreader.makeCallback(container)
#### spreader.makeCallback(container, errorHandler)

You can use this to bind the spreader to a specific container, and obtain a
callback you can then use for AJAX calls or something. If an error handler is 
specified, it will be called if the first argument to the callback is not a 
JSON object. The arguments to the error handler will be whatever the callback 
received.

```js
var callback = $.jsonSpreader({ ... }).makeCallback(".results");
$.getJSON("/api?whatever", callback);
```


Action specifications
=====================

As you may have noticed, all of the above doesn't really gain you much in terms
of typing less code, so a number of shortcut action specifications are available
in addition to providing actual functions to be called. The most general case is
this:

#### { "selector::funcName": function(data) }

What happens first is that the data is passed to the provided function. If the
function returns anything other than `undefined`, the result is passed to 
`container.find("selector").funcName(result)`. For example, something like this 
might be useful to handle incoming markdown content:

```js
spreader.add("project.readme", { ".readme::html", renderMarkdown });
```

#### { "selector::funcName": non-array-value }

Calls `funcName` like above, except it doesn't use JSON data at all, but 
instead uses the literal value provided. This is useful for things like CSS 
classes and styles, boolean attributes (in conjunction with `?` and `!` on the 
path), etc.

```js
spreader.add("comments?", { ".comment-container::css": { display: 'block' }})
```

#### { "selector::funcName": [ valueIfFalse, valueIfTrue ] }

Again calls the function, but provides the first array element as the value if 
the data is falsy, and the second if its truthy. If either is undefined (or if 
the array is too short), the data will be passed in instead, which is useful if 
you want to provide a default. If either is a function, it will be called with 
data and its result used.

```js
// add a class depending on ratings being there or not
spreader.add("ratings",
             { ".ratings::addClass": [ 'ratings-first', 'ratings-exist' ] });

// use `createStars` to create HTML or use a default if there is no average
spreader.add("ratings.average",
             { "#average::html", [ '(no ratings yet)', createStars ] });

// provide replacement text for a missing value
spreader.add("date_published",
             { ".date_published::text", [ '(not published)' ] });
```

#### { "selector@attrName": ... }

Calls `$("selector").attr("attrName", ...)`. You can use any of the above forms 
for the value. If the value turns out to be null, the attribute will be removed 
instead of being set. If it turns out to be undefined, nothing will be called at
all.

```js
// set the whole class attribute to one or the other
spreader.add("ratings", 
             { ".ratings@className": [ 'ratings-first', 'ratings-exist' ] });

// set a href attribute with a default, if the link is missing
spreader.add("node.link", { ".link@href": [ 'javascript://' ] });
```

#### { "selector::funcName": undefined }

This would be silly to use like this, but if you did, it would call the function
with no parameters. Useful for things like `show()` and `hide()`. It is 
mentioned here for completenes and because a shortcut below is implemented in 
terms of it.

#### "selector::funcName"
#### "selector@attrName"

If the action specification is a string instead of an object, it is equivalent 
to `{ "the string": [] }`, which basically means it passes the data in 
unmodified.

#### "selector::funcName()"

So, if you just want to call a function that takes no parameters, this is the 
way to do it. Equivalent to `{ "selector::funcName": undefined }`

#### "selector"

If there is no `::funcName` or `@attrName`, the result is equivalent to 
specifying `::text`, so it will set the content of the matched element. This is 
also true for actions specified inside `{ }`.

#### { "::funcName": ... }
#### { "@attrName": ... }

If there is no selector, one is constructed from the key name to which this
rule applies, so the following are all equivalent:

```js
spreader.add("foo.bar");
spreader.add("foo.bar", ".foo-bar");
spreader.add("foo.bar", { ".foo-bar": [] });
spreader.add("foo.bar", ".foo-bar::text");
```

as are the following:

```js
spreader.add("foo.bar", "@attrName");
spreader.add("foo.bar", ".foo-bar@attrName");
spreader.add("foo.bar", { ".foo-bar@attrName": [] });
```

Array handlers
==============

As explained above, arrays get special treatment. There are currently two things
you can do with them (other than writing a completely custom handler callback, 
of course). The first case is useful for arrays of simple values which you just 
want to display. It joins them using a separator with optional text at the 
beginning and end, and with an optional fallback for the empty case:

```js
spreader.add("tags[]", {
    target: "#tags",
    join: ", ",
    between: [ "[ ", " ]" ],
    fallback: "no tags :(" 
});
```

The `target` selector can include `::funcName` or `@attrName`, obviously. The 
default for `join` is `", "` and the default for `between` and `fallback` are 
empty strings, so if all you want is just a comma-separated list, you can simply
write

```js
spreader.add("tags[]", ".tags");
// or, in this case where names match, simply spreader.add("tags[]")
```


The second thing you can do is to use a DOM template, which gets replicated for
each element, then call an inner spreader on each of the elements in turn.

The call to use looks like this:

```js
spreader.add("comments[]", {
    template: ".comment", // this must select the whole list, not the parent
    spread: spreader, // either an actual spreader object, or one will be
                      // constructed by passing this to add()
    deepClone: true/false,
    fallback: { something: "other" }, // as if this were the only element;
                                      // can also use an array or a function
    beforeUpdate: function(jQuery, data_el), // called before an update
    afterUpdate: function(jQuery, data_el), // called after an update
    beforeDelete: function(jQuery), // called before an element is deleted,
                                    // preceded by beforeUpdate(jQuery, null)
    afterCreate: function(jQuery, data_el) // called after an element is created
                                           // followed by afterUpdate
});
```

Everything is optional, except for `template` and `spread`. Then, what will 
happen is the following:

* If the array is empty (or not an array at all), the fallback will be used 
  instead. The default fallback is an empty array.
* The template elements/copies will be looked for. If nothing is found, the 
  process stops.
* If there are too many, they will be removed (from the end), except at least 
  one will always be left (so it can be used in a later update)
* If the array is empty, the remaining template gets class `js-list-empty` and
  the process stops.
* `js-list-empty` is removed from the first template instance
* If there are too few template instances, the last one will be replicated 
  using $.clone() and attached to DOM using .after(), so 
  `$last.after($last.clone())`
* Finally, the inner spreader will be called with data from each element, and 
  using the corresponding template instance as the new container.
* The callbacks will be called during the process, as described above in 
  comments


Status
======

Currently, most everything seems to work as described, except the following
are missing:
* `data-js` parsing (the simple case is easy, but have to figure out what to
  exactly to do with arrays)
* `between` with simple array joining
* actions without selectors (just `::funcName` or `@attrName`)
* class `js-list-empty` is not added yet