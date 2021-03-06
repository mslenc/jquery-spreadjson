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
var ObjProto = Object.prototype;
var toString = ObjProto.toString;
var hasOwnProperty = ObjProto.hasOwnProperty;

var makeIs = function(what) {
    var expect = '[object ' + what + ']';
    return function(obj) {
        return toString.call(obj) === expect;
    }
}
var isArray = Array.isArray || makeIs('Array');
var isString = makeIs('String');
var isFunction = makeIs('Function');
var isObject = function(obj) {
	return typeof obj === 'object' && !!obj;
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
        if (beginsWith(name, 'class(') && endsWith(name, ')')) {
            var className = name.substring(6, name.length - 1).trim();
            var classNames = className.split('/');
            if (classNames.length == 2) {
                classNames[0] = classNames[0].trim();
                classNames[1] = classNames[1].trim();
                addActionCallback(function(data, container) {
                    var val = filter(data);
                    var $el = finder(container);
                    var f = falsy(val);
                    $el.addClass(classNames[f ? 1 : 0]);
                    $el.removeClass(classNames[f ? 0 : 1]);
                }, props, out);
            } else {
                addActionCallback(function(data, container) {
                    var val = filter(data);
                    var $el = finder(container);
                    if (falsy(val)) {
                        $el.removeClass(className);
                    } else {
                        $el.addClass(className);
                    }
                }, props, out);
            }
        } else {
            addActionCallback(function (data, container) {
                var attrVal = filter(data);
                if (attrVal === undefined)
                    return;
                var $el = finder(container);
                if (attrVal === null) {
                    $el.removeAttr(name);
                } else {
                    $el.attr(name, attrVal);
                }
            }, props, out);
        }
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

var callCallback = function(callback, param, param2) {
	if (callback)
		callback(param, param2);
};

var makeArrayHandler = function(spec, elsFinder, deepClone, fallback) {
    var spreader = spec.spread;

    return function(array, container) {
        if (!isArray(array) || array.length == 0)
            array = fallback;

        var domEls = elsFinder(container);
        if (domEls.length < 1)
            return;

        var i, domCont;

        var leave = Math.max(1, Math.min(array.length, domEls.length));
        for (i = domEls.length - 1; i >= leave; i--) {
            domCont = $(domEls[i]);
			callCallback(spec.beforeUpdate, domCont, null);
			callCallback(spec.beforeDelete, domCont, undefined);
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
			callCallback(spec.beforeUpdate, domCont, array[i]);
            spreader.spread(array[i], domCont);
			callCallback(spec.afterUpdate, domCont, array[i]);
        }

        var last = $(domEls[domEls.length - 1]);
        for (i = domEls.length; i < array.length; i++) {
            domCont = last.clone(deepClone);
            last.after(domCont);
            last = domCont;

            spreader.spread(array[i], domCont);
			callCallback(spec.afterCreate, domCont, array[i]);
			callCallback(spec.afterUpdate, domCont, array[i]);
        }
    }
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
        spreader = spec.spread = $.spreadJson(spreader);
    if (!spreader.actions.length)
        return;

    var deepClone = spec.deepClone || false;

    var fallback = has(spec, 'fallback') ? spec.fallback : [ ];
    if (!isArray(fallback))
        fallback = [ fallback ];

    var elsFinder = function(container) { return container.find(template); };

    addActionCallback(makeArrayHandler(spec, elsFinder, deepClone, fallback), props, out);
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
    if (isFunction(actionSpec)) {
        addActionCallback(actionSpec, props, out);
    } else
    if (isObject(actionSpec)) {
        if (props.isArray) {
            addActionArray(actionSpec, props, out);
        } else {
            for (key in actionSpec)
                if (has(actionSpec, key))
                    addActionSelector(key, actionSpec[key], props, out);
        }
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
    var args = arguments;
    if (args.length < 1)
        return this;

    if (isString(args[0])) {
        if (args.length === 1) {
            addPath.call(this, args[0], pathToClass(extractSuffix(args[0]).path));
        } else {
            addPath.apply(this, args);
        }
    } else {
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
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
    var parts = props && props.split(',') || [ "" ];
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
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
            if (beginsWith(selector, "::") || beginsWith(selector, "@"))
                selector = "." + selector;
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

var _workers = {};

var doDataProps = function(json, props, container) {
    if (!(props in _workers))
        _workers[props] = buildDataWorker(props);

    _workers[props].spread(json, container);
};

var doDataList = function(json, arrayPath, container) {
    var arrHandler = $.data(container, 'spreadjson-arrhandler');
    if (!arrHandler) {
        var spec = { spread: { spread: doData } };
        var elsFinder = function() {
            return container.parent().find('[data-js-list="' + arrayPath + '"]')
        };
        arrHandler = makeArrayHandler(spec, elsFinder, true, []);
        arrHandler.path = arrayPath && arrayPath.split(".") || [];
        $.data(container, 'spreadjson-arrhandler', arrHandler);
    }
    var array = extract(arrHandler.path, json);
    arrHandler(array);
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
	var args = arguments;
    if (args.length > 0)
        spreader.add(rules);
    if (args.length > 1)
        spreader.spread(json, container);
    return spreader;
};

$.fn.spreadJson = function(rules, json) {
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
    mailto: function(email) { return isString(email) && email ? 'mailto:' + email : null; },
    nbsp: function(text) { return isString(text) ? text.replace(' ', '\u00a0') : '' }
};

})(jQuery);
