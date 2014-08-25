/* 
   Copyright 2014 Mitja Slenc

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

(function($, undefined) {

// some utilities..
var toString = Object.prototype.toString;
var hasOwnProperty = Object.prototype.hasOwnProperty;

var isArray = Array.isArray || function(obj) {
    return toString.call(obj) === '[object Array]';
};
var isString = function(obj) {
    return toString.call(obj) === '[object String]';
};
var isFunction = function(obj) {
    return toString.call(obj) === '[object Function]';
};
var isObject = function(obj) {
    return Object(obj) === obj;
};
var is = function(obj, klass) {
    return obj instanceof klass;
};
var has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
};
var falsy = function(obj) {
    return obj ? (isArray(obj) ? !obj.length : false) : true;
};
var copy = function(obj) {
    var res = { };
    for (key in obj)
        res[key] = obj[key];
    return res;
};

function endsWith(str, ending) {
    return str.indexOf(ending, str.length - ending.length) !== -1;
}
function beginsWith(str, beginning) {
    return str.indexOf(beginning) === 0;
}

function Spreader() {
    this.actions = [];
}

var addActionCallback = function(callback, props, out) {
    var action = copy(props);
    action.callback = callback;
    out.actions.push(action);
};

var addActionString = function(string, props, out) {
    if (endsWith(string, '()')) {
        addActionSelector(string.substring(0, string.length - 2), undefined, props, out);
    } else {
        addActionSelector(string, [], props, out);
    }
};

var identity = function(a) { return a; };

var makeFilter = function(spec) {
    if (spec === undefined || isFunction(spec))
        return spec;

    if (isArray(spec)) {
        if (spec.length === 0)
            return identity;
        var ifFalsy = spec[0];
        if (spec.length === 1) {
            if (isFunction(ifFalsy)) {
                return function (data) {
                    return falsy(data) ? ifFalsy(data) : data;
                };
            } else {
                return function (data) {
                    return falsy(data) ? ifFalsy : data;
                };
            }
        }
        var ifTruthy = spec[1];
        return function(data) {
            var res = falsy(data) ? ifFalsy : ifTruthy;
            return isFunction(res) ? res(data) : res;
        };
    }

    return function() { return spec; };
};

function pathToClass(path) {
    return '.' + (isArray(path) ? path.join('-') : path.replace('.', '-'));
}

var _suffixes = ['[]', '?!', '?', '!', ''];
function extractSuffix(path) {
    for (var i = 0; i < _suffixes.length; i++) {
        var suffix = _suffixes[i];
        if (endsWith(path, suffix)) {
            return {
                path: path.substring(0, path.length - suffix.length),
                suffix: suffix
            };
        }
    }
}

var addActionSelector = function(selector, value, props, out) {
    var filter = makeFilter(value);

    var hasFunc = selector.indexOf('::') >= 0;
    var hasAttr = !hasFunc && selector.indexOf('@') >= 0;

    if (!hasFunc && !hasAttr) {
        selector += '::text';
        hasFunc = true;
    }

    if (beginsWith(selector, '::') || beginsWith(selector, '@')) {
        selector = pathToClass(props.path) + selector;
    }

    var tmp = hasFunc ? selector.split("::") : selector.split('@');
    if (tmp.length > 2)
        return;

    var sel = tmp[0].trim(), name = tmp[1].trim();
    if (!name.length)
        return;

    if (sel === '.')
        sel = '';

    var finder;
    if (!sel) {
        finder = identity;
    } else {
        finder = function(container) {
            return container.find(sel);
        };
    }

    if (filter === undefined) { // call with no arguments
        // so must be a function call
        if (hasFunc) {
            addActionCallback(function(data, container) {
                finder(container)[name]();
            }, props, out);
        }
        return;
    }

    if (hasFunc) { // call function
        addActionCallback(function(data, container) {
            var res = filter(data);
            if (res === undefined)
                return;
            finder(container)[name](res);
        }, props, out);
        return;
    }

    if (hasAttr) { // set attribute
        addActionCallback(function(data, container) {
            var attrVal = filter(data);
            if (attrVal === undefined)
                return;

            if (attrVal === null) {
                finder(container).removeAttr(name);
            } else {
                finder(container).attr(name, attrVal);
            }
        }, props, out);
        return;
    }

    // maybe some other cases later
};

var buildJoiner = function(spec) {
    var sep = has(spec, 'join') ? spec.join : ', ';

    var fallback = has(spec, 'fallback') ? spec.fallback : "";
    if (isArray(fallback) && fallback.length == 0)
        fallback = "";

    var between = spec.between;
    if (isString(between)) {
        between = [ between, between ];
    } else
    if (isArray(between)) {
        if (between.length == 0) {
            between = undefined;
        } else
        if (between.length == 1) {
            between = [ between[0], between[0] ];
        }
    } else {
        between = undefined;
    }

    return function(data) {
        if (falsy(data)) {
            data = fallback;
            if (!isArray(data))
                return data;
        }

        var joined = data.join(sep);
        if (between) {
            return between[0] + joined + between[1];
        } else {
            return joined;
        }
    };
};

var addActionArray = function(spec, props, out) {
    if ('target' in spec) {
        addActionSelector(spec.target, buildJoiner(spec), props, out);
        return;
    }

    var template = spec.template;
    if (!isString(template))
        return;

    var spreader = spec.spread;
    if (!spreader)
        return;
    if (!is(spreader, Spreader))
        spreader = $.spreadJson(spreader);
    if (!spreader.actions.length)
        return;

    var deepClone = spec.deepClone || false;

    var fallback = has(spec, 'fallback') ? spec.fallback : [ ];
    if (!isArray(fallback))
        fallback = [ fallback ];

    addActionCallback(function(array, container) {
        if (!isArray(array) || array.length == 0)
            array = fallback;

        var domEls = container.find(template);
        if (domEls.length < 1)
            return;

        var i, domCont;

        var leave = Math.max(1, Math.min(array.length, domEls.length));
        for (i = domEls.length - 1; i >= leave; i--) {
            domCont = $(domEls[i]);
            if (spec.beforeUpdate)
                spec.beforeUpdate(domCont, null);
            if (spec.beforeDelete)
                spec.beforeDelete(domCont);
            domCont.remove();
        }

        if (array.length > 0) {
            $(domEls[0]).removeClass('js-list-empty');
        } else {
            $(domEls[0]).addClass('js-list-empty');
            return;
        }

        domEls.length = leave;
        for (i = 0; i < domEls.length; i++) {
            domCont = $(domEls[i]);
            if (spec.beforeUpdate)
                spec.beforeUpdate(domCont, array[i]);
            spreader.spread(array[i], domCont);
            if (spec.afterUpdate)
                spec.afterUpdate(domCont, array[i]);
        }

        var last = $(domEls[domEls.length - 1]);
        for (i = domEls.length; i < array.length; i++) {
            domCont = last.clone(deepClone);
            last.after(domCont);
            last = domCont;

            spreader.spread(array[i], domCont);
            if (spec.afterCreate)
                spec.afterCreate(domCont, array[i]);
            if (spec.afterUpdate)
                spec.afterUpdate(domCont, array[i]);
        }
    }, props, out);
};

var addAction = function(actionSpec, props, out) {
    if (isArray(actionSpec)) {
        for (var i = 0; i < actionSpec.length; i++)
            addAction(actionSpec[i], props, out);
    } else
    if (isString(actionSpec)) {
        if (props.isArray) {
            addActionArray({ target: actionSpec }, props, out);
        } else {
            addActionString(actionSpec, props, out);
        }
    } else
    if (isObject(actionSpec)) {
        if (props.isArray) {
            addActionArray(actionSpec, props, out);
        } else {
            for (key in actionSpec)
                if (has(actionSpec, key))
                    addActionSelector(key, actionSpec[key], props, out);
        }
    } else
    if (isFunction(actionSpec)) {
        addActionCallback(actionSpec, props, out);
    } else {
        // ???
    }
};

var addPath = function(pathWithSuffix) {
    var tmp = extractSuffix(pathWithSuffix);

    var props = {
        isArray: false,
        runTruthy: true,
        runFalsy: true,
        toEmpty: false,
        path: tmp.path ? tmp.path.split('.') : []
    };

    switch (tmp.suffix) {
        case '[]':
            props.isArray = true;
            break;
        case '?!':
            props.toEmpty = true;
            break;
        case '?':
            props.runFalsy = false;
            break;
        case '!':
            props.runTruthy = false;
            props.toEmpty = true;
            break;
    }

    for (var i = 1; i < arguments.length; i++)
        addAction(arguments[i], props, this);
};

Spreader.prototype.add = function() {
    if (arguments.length < 1)
        return this;

    if (isString(arguments[0])) {
        if (arguments.length === 1) {
            addPath.call(this, arguments[0], pathToClass(extractSuffix(arguments[0]).path));
        } else {
            addPath.apply(this, arguments);
        }
    } else {
        for (var i = 0; i < arguments.length; i++) {
            var arg = arguments[i];
            if (isArray(arg)) {
                for (var j = 0; j < arg.length; j++)
                    this.add(arg[j]);
            } else
            if (isObject(arg)) {
                for (key in arg) {
                    if (has(arg, key))
                        this.add(key, arg[key]);
                }
            } else
            if (isString(arg)) {
                this.add(arg);
            } else {
                // ???
            }
        }
    }
    return this;
};

var extract = function(path, json) {
    var curr = json;
    for (var i = 0; i < path.length; i++) {
        if (isObject(curr) && has(curr, path[i])) {
            curr = curr[path[i]];
        } else {
            return undefined;
        }
    }
    return curr;
};

var buildDataWorker = function(props) {
    var spreader = $.spreadJson();
    var parts = props.split(',');
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (!part)
            continue;
        // each part is
        // - selector = path
        // - path
        // and path can have | filter
        var tmp = part.split('=');
        if (tmp.length > 2)
            continue;

        var selector, path;
        if (tmp.length == 1) {
            selector = '.';
            path = tmp[0].trim();
        } else {
            selector = tmp[0].trim() || '.';
            path = tmp[1].trim();
        }

        var filter;
        tmp = path.split('|');
        if (tmp.length > 2)
            continue;
        if (tmp.length == 2) {
            path = tmp[0].trim();
            filter = $.spreadJson.filters[tmp[1].trim()] || [];
        } else {
            filter = [];
        }

        if (endsWith(selector, '()')) {
            selector = selector.substring(0, selector.length - 2).trim();
            filter = undefined;
        }

        var op = {};
        op[selector] = filter;
        addPath.call(spreader, path, op);
    }
    return spreader;
};

var doDataProps = function(json, props, container) {
    var src = $.data(container, 'spreadjson-src');
    if (src !== props) {
        $.data(container, 'spreadjson-src', src);
        $.data(container, 'spreadjson-worker', buildDataWorker(props));
    }
    $.data(container, 'spreadjson-worker').spread(json, container);
};

var doDataList = function(json, arrayPath, container) {

};

var doData = function(json, container) {
    var children = container.children();
    var listsDone = false;
    var child = false;
    for (var i = 0; i < children.length; i++) {
        // don't create so many objects when not really needed
        child ? child.init(children[i]) : child = $(children[i]);

        var arraySource = child.attr('data-js-list');
        if (isString(arraySource)) {
            if (listsDone && arraySource in listsDone)
                continue;
            (listsDone || (listsDone = { }))[arraySource] = true;

            doDataList(json, arraySource, $(child[0]));
            continue;
        }

        var props = child.attr('data-js');
        if (isString(props)) {
            doDataProps(json, props, $(child[0]));
        }

        doData(json, child);
    }
};

Spreader.prototype.spread = function(json, container) {
    if (!isObject(json))
        return this;

    if (isString(container)) {
        container = $(container);
    } else
    if (!is(container, jQuery)) {
        container = $(document);
    }
    if (container.length > 1)
        container = $(container[0]);

    var actions = this.actions;
    for (var i = 0; i < actions.length; i++) {
        var action = actions[i];

        var value = extract(action.path, json);
        if (falsy(value)) {
            if (!action.runFalsy)
                continue;
            if (action.toEmpty)
                value = "";
        } else {
            if (!action.runTruthy)
                continue;
        }
        action.callback.call(null, value, container);
    }

    if (container.length != 0)
        doData(json, container);

    return this;
};

Spreader.prototype.makeCallback = function(container, errorHandler) {
    var self = this;
    return function(json) {
        if (isObject(json)) {
            self.spread(json, container);
        } else
        if (errorHandler) {
            errorHandler.apply(null, arguments);
        }
    };
};

var findKeys = function(json, prefix, res) {
    for (key in json) {
        if (!has(json, key))
            continue;

        var path = prefix + key;
        var child = json[key];
        if (!isArray(child) && !isObject(child))
            res[path] = pathToClass(path);

        if (isObject(child)) {
            findKeys(child, prefix + key + '.', res);
        }
    }
};

var autoRulesFromJson = function(json) {
    var res = { };
    findKeys(json, "", res);
    return res;
};

$.spreadJson = function(rules, json, container) {
    var spreader = new Spreader();
    if (arguments.length > 0)
        spreader.add(rules);
    if (arguments.length > 1)
        spreader.spread(json, container);
    return spreader;
};

$.fn.spreadJson = function(rules, json, container) {
    if (arguments.length == 1) {
        json = rules;
        rules = autoRulesFromJson(json);
    }
    if (is(rules, Spreader)) {
        return rules.spread(json, this);
    } else {
        return $.spreadJson(rules, json, this);
    }
};

$.spreadJson.filters = {
    mailto: function(email) { return isString(email) && email ? 'mailto:' + email : ''; },
    nbsp: function(text) { return isString(text) ? text.replace(' ', '\u00a0') : '' }
};

})(jQuery);
