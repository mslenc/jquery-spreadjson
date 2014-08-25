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
var slice = Array.prototype.slice
var falsy = function(obj) {
    return obj ? (isArray(obj) ? !obj.length : false) : true;
};
var truthy = function(obj) {
    return !falsy(obj);
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

function Spreader() {
    this.actions = [];
}

var addActionCallback = function(callback, props, out) {
    var action = copy(props);
    action.callback = callback;
    out.actions.push(action);
};

var addActionString = function(string, props, out) {
    if (string.endsWith('()')) {
        addActionSelector(string.substring(0, string.length - 2), undefined, props, out);
    } else {
        addActionSelector(string, [], props, out);
    }
};

var identity = function(a) { return a; };

var makeFilter = function(spec) {
    if (spec === undefined)
        return undefined;

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

    if (isFunction(spec))
        return spec;

    return function() { return spec; };
};

var addActionSelector = function(selector, value, props, out) {
    var filter = makeFilter(value);
    var tmp = selector.split("::");
    if (tmp.length > 2)
        return;
    if (filter === undefined) {
        // must be a function call
        if (tmp.length == 2) {
            var sel = tmp[0];
            var funcName = tmp[1];
            addActionCallback(function(data, container) {
                container.find(sel)[funcName]();
            }, props, out);
        }
        return;
    }

    if (tmp.length === 2) {
        var sel = tmp[0];
        var funcName = tmp[1];
        addActionCallback(function(data, container) {
            var res = filter(data);
            if (res === undefined)
                return;
            container.find(sel)[funcName](res);
        }, props, out);
        return;
    }

    tmp = selector.split('@');
    if (tmp.length === 2) {
        var sel = tmp[0];
        var attr = tmp[1];
        addActionCallback(function(data, container) {
            var attrVal = filter(data);
            if (attrVal === undefined)
                return;
            if (attrVal === null) {
                container.find(sel).removeAttr(attr);
            } else {
                container.find(sel).attr(attr, attrVal);
            }
        }, props, out);
        return;
    }

    addActionCallback(function(data, container) {
        var text = filter(data);
        if (text === undefined)
            return;
        container.find(selector).text(text);
    }, props, out);
};

var buildJoiner = function(spec) {
    var sep = has(spec, 'join') ? spec.join : ', ';
    var fallback = has(spec, 'fallback') ? spec.fallback : [];
    return function(data) {
        if (falsy(data) && !isArray(data))
            return fallback;

        return data.join(sep);
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

    addActionCallback(function(array, container) {
        if (falsy(array))
            array = spec.fallback || [ ];
        if (!isArray(array))
            array = [ array ];

        var deepClone = spec.deepClone || false;

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

var addPath = function(path) {
    var props;
    var suffix = 0;
    var isArray = false, runTruthy = true, runFalsy = true, toEmpty = false;
    if (path.endsWith('[]')) {
        suffix = 2;
        isArray = true;
    } else
    if (path.endsWith('!')) {
        if (path.endsWith('?!')) {
            suffix = 2;
            toEmpty = true;
        } else {
            suffix = 1;
            runTruthy = false;
            toEmpty = true;
        }
    } else
    if (path.endsWith('?')) {
        suffix = 1;
        runFalsy = false;
    }

    if (suffix > 0)
        path = path.substring(0, path.length - suffix);

    props = {
        isArray: isArray,
        runTruthy: runTruthy,
        runFalsy: runFalsy,
        toEmpty: false,
        path: path ? path.split('.') : []
    };

    for (var i = 1; i < arguments.length; i++)
        addAction(arguments[i], props, this);
};

Spreader.prototype.add = function() {
    if (arguments.length < 1)
        return this;

    if (isString(arguments[0])) {
        if (arguments.length === 1) {
            addPath.call(this, match, '.' + match.replace('.', '-'));
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

        res.push(prefix + key);
        var child = json[key];
        if (isObject(child)) {
            findKeys(child, prefix + key + '-', res);
        }
    }
};

var autoRulesFromJson = function(json) {
    var res = [];
    findKeys(json, ".", res);
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

})(jQuery);
