(function() {
    /**
     * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
     * Available via the MIT or new BSD license.
     * see: http://github.com/jrburke/almond for details
     */
    //Going sloppy to avoid 'use strict' string cost, but strict practices should
    //be followed.
    /*jslint sloppy: true */
    /*global setTimeout: false */
    
    var requirejs, require, define;
    (function (undef) {
        var main, req, makeMap, handlers,
            defined = {},
            waiting = {},
            config = {},
            defining = {},
            hasOwn = Object.prototype.hasOwnProperty,
            aps = [].slice;
    
        function hasProp(obj, prop) {
            return hasOwn.call(obj, prop);
        }
    
        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @returns {String} normalized name
         */
        function normalize(name, baseName) {
            var nameParts, nameSegment, mapValue, foundMap,
                foundI, foundStarMap, starI, i, j, part,
                baseParts = baseName && baseName.split("/"),
                map = config.map,
                starMap = (map && map['*']) || {};
    
            //Adjust any relative paths.
            if (name && name.charAt(0) === ".") {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that "directory" and not name of the baseName's
                    //module. For instance, baseName of "one/two/three", maps to
                    //"one/two/three.js", but we want the directory, "one/two" for
                    //this normalization.
                    baseParts = baseParts.slice(0, baseParts.length - 1);
    
                    name = baseParts.concat(name.split("/"));
    
                    //start trimDots
                    for (i = 0; i < name.length; i += 1) {
                        part = name[i];
                        if (part === ".") {
                            name.splice(i, 1);
                            i -= 1;
                        } else if (part === "..") {
                            if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                                //End of the line. Keep at least one non-dot
                                //path segment at the front so it can be mapped
                                //correctly to disk. Otherwise, there is likely
                                //no path mapping for a path starting with '..'.
                                //This can still fail, but catches the most reasonable
                                //uses of ..
                                break;
                            } else if (i > 0) {
                                name.splice(i - 1, 2);
                                i -= 2;
                            }
                        }
                    }
                    //end trimDots
    
                    name = name.join("/");
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }
    
            //Apply map config if available.
            if ((baseParts || starMap) && map) {
                nameParts = name.split('/');
    
                for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join("/");
    
                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = map[baseParts.slice(0, j).join('/')];
    
                            //baseName segment has  config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = mapValue[nameSegment];
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break;
                                }
                            }
                        }
                    }
    
                    if (foundMap) {
                        break;
                    }
    
                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && starMap[nameSegment]) {
                        foundStarMap = starMap[nameSegment];
                        starI = i;
                    }
                }
    
                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }
    
                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }
    
            return name;
        }
    
        function makeRequire(relName, forceSync) {
            return function () {
                //A version of a require function that passes a moduleName
                //value for items that may need to
                //look up paths relative to the moduleName
                return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
            };
        }
    
        function makeNormalize(relName) {
            return function (name) {
                return normalize(name, relName);
            };
        }
    
        function makeLoad(depName) {
            return function (value) {
                defined[depName] = value;
            };
        }
    
        function callDep(name) {
            if (hasProp(waiting, name)) {
                var args = waiting[name];
                delete waiting[name];
                defining[name] = true;
                main.apply(undef, args);
            }
    
            if (!hasProp(defined, name) && !hasProp(defining, name)) {
                throw new Error('No ' + name);
            }
            return defined[name];
        }
    
        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }
    
        /**
         * Makes a name map, normalizing the name, and using a plugin
         * for normalization if necessary. Grabs a ref to plugin
         * too, as an optimization.
         */
        makeMap = function (name, relName) {
            var plugin,
                parts = splitPrefix(name),
                prefix = parts[0];
    
            name = parts[1];
    
            if (prefix) {
                prefix = normalize(prefix, relName);
                plugin = callDep(prefix);
            }
    
            //Normalize according
            if (prefix) {
                if (plugin && plugin.normalize) {
                    name = plugin.normalize(name, makeNormalize(relName));
                } else {
                    name = normalize(name, relName);
                }
            } else {
                name = normalize(name, relName);
                parts = splitPrefix(name);
                prefix = parts[0];
                name = parts[1];
                if (prefix) {
                    plugin = callDep(prefix);
                }
            }
    
            //Using ridiculous property names for space reasons
            return {
                f: prefix ? prefix + '!' + name : name, //fullName
                n: name,
                pr: prefix,
                p: plugin
            };
        };
    
        function makeConfig(name) {
            return function () {
                return (config && config.config && config.config[name]) || {};
            };
        }
    
        handlers = {
            require: function (name) {
                return makeRequire(name);
            },
            exports: function (name) {
                var e = defined[name];
                if (typeof e !== 'undefined') {
                    return e;
                } else {
                    return (defined[name] = {});
                }
            },
            module: function (name) {
                return {
                    id: name,
                    uri: '',
                    exports: defined[name],
                    config: makeConfig(name)
                };
            }
        };
    
        main = function (name, deps, callback, relName) {
            var cjsModule, depName, ret, map, i,
                args = [],
                usingExports;
    
            //Use name if no relName
            relName = relName || name;
    
            //Call the callback to define the module, if necessary.
            if (typeof callback === 'function') {
    
                //Pull out the defined dependencies and pass the ordered
                //values to the callback.
                //Default to [require, exports, module] if no deps
                deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
                for (i = 0; i < deps.length; i += 1) {
                    map = makeMap(deps[i], relName);
                    depName = map.f;
    
                    //Fast path CommonJS standard dependencies.
                    if (depName === "require") {
                        args[i] = handlers.require(name);
                    } else if (depName === "exports") {
                        //CommonJS module spec 1.1
                        args[i] = handlers.exports(name);
                        usingExports = true;
                    } else if (depName === "module") {
                        //CommonJS module spec 1.1
                        cjsModule = args[i] = handlers.module(name);
                    } else if (hasProp(defined, depName) ||
                               hasProp(waiting, depName) ||
                               hasProp(defining, depName)) {
                        args[i] = callDep(depName);
                    } else if (map.p) {
                        map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                        args[i] = defined[depName];
                    } else {
                        throw new Error(name + ' missing ' + depName);
                    }
                }
    
                ret = callback.apply(defined[name], args);
    
                if (name) {
                    //If setting exports via "module" is in play,
                    //favor that over return value and exports. After that,
                    //favor a non-undefined return value over exports use.
                    if (cjsModule && cjsModule.exports !== undef &&
                            cjsModule.exports !== defined[name]) {
                        defined[name] = cjsModule.exports;
                    } else if (ret !== undef || !usingExports) {
                        //Use the return value from the function.
                        defined[name] = ret;
                    }
                }
            } else if (name) {
                //May just be an object definition for the module. Only
                //worry about defining if have a module name.
                defined[name] = callback;
            }
        };
    
        requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
            if (typeof deps === "string") {
                if (handlers[deps]) {
                    //callback in this case is really relName
                    return handlers[deps](callback);
                }
                //Just return the module wanted. In this scenario, the
                //deps arg is the module name, and second arg (if passed)
                //is just the relName.
                //Normalize module name, if it contains . or ..
                return callDep(makeMap(deps, callback).f);
            } else if (!deps.splice) {
                //deps is a config object, not an array.
                config = deps;
                if (callback.splice) {
                    //callback is an array, which means it is a dependency list.
                    //Adjust args if there are dependencies
                    deps = callback;
                    callback = relName;
                    relName = null;
                } else {
                    deps = undef;
                }
            }
    
            //Support require(['a'])
            callback = callback || function () {};
    
            //If relName is a function, it is an errback handler,
            //so remove it.
            if (typeof relName === 'function') {
                relName = forceSync;
                forceSync = alt;
            }
    
            //Simulate async callback;
            if (forceSync) {
                main(undef, deps, callback, relName);
            } else {
                //Using a non-zero value because of concern for what old browsers
                //do, and latest browsers "upgrade" to 4 if lower value is used:
                //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
                //If want a value immediately, use require('id') instead -- something
                //that works in almond on the global level, but not guaranteed and
                //unlikely to work in other AMD implementations.
                setTimeout(function () {
                    main(undef, deps, callback, relName);
                }, 4);
            }
    
            return req;
        };
    
        /**
         * Just drops the config on the floor, but returns req in case
         * the config return value is used.
         */
        req.config = function (cfg) {
            config = cfg;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            return req;
        };
    
        define = function (name, deps, callback) {
    
            //This module may not have dependencies
            if (!deps.splice) {
                //deps is not an array, so probably means
                //an object literal or factory function for
                //the value. Adjust args.
                callback = deps;
                deps = [];
            }
    
            if (!hasProp(defined, name) && !hasProp(waiting, name)) {
                waiting[name] = [name, deps, callback];
            }
        };
    
        define.amd = {
            jQuery: true
        };
    }());
    
    define("libs/almond", function(){});
    
    /*! jQuery v1.12.4 | (c) jQuery Foundation | jquery.org/license */
    !function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=a.document,e=c.slice,f=c.concat,g=c.push,h=c.indexOf,i={},j=i.toString,k=i.hasOwnProperty,l={},m="1.12.4",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return e.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:e.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a){return n.each(this,a)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(e.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor()},push:g,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(e=arguments[h]))for(d in e)a=g[d],c=e[d],g!==c&&(j&&c&&(n.isPlainObject(c)||(b=n.isArray(c)))?(b?(b=!1,f=a&&n.isArray(a)?a:[]):f=a&&n.isPlainObject(a)?a:{},g[d]=n.extend(j,f,c)):void 0!==c&&(g[d]=c));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray||function(a){return"array"===n.type(a)},isWindow:function(a){return null!=a&&a==a.window},isNumeric:function(a){var b=a&&a.toString();return!n.isArray(a)&&b-parseFloat(b)+1>=0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},isPlainObject:function(a){var b;if(!a||"object"!==n.type(a)||a.nodeType||n.isWindow(a))return!1;try{if(a.constructor&&!k.call(a,"constructor")&&!k.call(a.constructor.prototype,"isPrototypeOf"))return!1}catch(c){return!1}if(!l.ownFirst)for(b in a)return k.call(a,b);for(b in a);return void 0===b||k.call(a,b)},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?i[j.call(a)]||"object":typeof a},globalEval:function(b){b&&n.trim(b)&&(a.execScript||function(b){a.eval.call(a,b)})(b)},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b){var c,d=0;if(s(a)){for(c=a.length;c>d;d++)if(b.call(a[d],d,a[d])===!1)break}else for(d in a)if(b.call(a[d],d,a[d])===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):g.call(c,a)),c},inArray:function(a,b,c){var d;if(b){if(h)return h.call(b,a,c);for(d=b.length,c=c?0>c?Math.max(0,d+c):c:0;d>c;c++)if(c in b&&b[c]===a)return c}return-1},merge:function(a,b){var c=+b.length,d=0,e=a.length;while(c>d)a[e++]=b[d++];if(c!==c)while(void 0!==b[d])a[e++]=b[d++];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,e,g=0,h=[];if(s(a))for(d=a.length;d>g;g++)e=b(a[g],g,c),null!=e&&h.push(e);else for(g in a)e=b(a[g],g,c),null!=e&&h.push(e);return f.apply([],h)},guid:1,proxy:function(a,b){var c,d,f;return"string"==typeof b&&(f=a[b],b=a,a=f),n.isFunction(a)?(c=e.call(arguments,2),d=function(){return a.apply(b||this,c.concat(e.call(arguments)))},d.guid=a.guid=a.guid||n.guid++,d):void 0},now:function(){return+new Date},support:l}),"function"==typeof Symbol&&(n.fn[Symbol.iterator]=c[Symbol.iterator]),n.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(a,b){i["[object "+b+"]"]=b.toLowerCase()});function s(a){var b=!!a&&"length"in a&&a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=ga(),z=ga(),A=ga(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+M+"))|)"+L+"*\\]",O=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+N+")*)|.*)\\)|)",P=new RegExp(L+"+","g"),Q=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),R=new RegExp("^"+L+"*,"+L+"*"),S=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),T=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),U=new RegExp(O),V=new RegExp("^"+M+"$"),W={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M+"|[*])"),ATTR:new RegExp("^"+N),PSEUDO:new RegExp("^"+O),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},X=/^(?:input|select|textarea|button)$/i,Y=/^h\d$/i,Z=/^[^{]+\{\s*\[native \w/,$=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,_=/[+~]/,aa=/'|\\/g,ba=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),ca=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},da=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(ea){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function fa(a,b,d,e){var f,h,j,k,l,o,r,s,w=b&&b.ownerDocument,x=b?b.nodeType:9;if(d=d||[],"string"!=typeof a||!a||1!==x&&9!==x&&11!==x)return d;if(!e&&((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,p)){if(11!==x&&(o=$.exec(a)))if(f=o[1]){if(9===x){if(!(j=b.getElementById(f)))return d;if(j.id===f)return d.push(j),d}else if(w&&(j=w.getElementById(f))&&t(b,j)&&j.id===f)return d.push(j),d}else{if(o[2])return H.apply(d,b.getElementsByTagName(a)),d;if((f=o[3])&&c.getElementsByClassName&&b.getElementsByClassName)return H.apply(d,b.getElementsByClassName(f)),d}if(c.qsa&&!A[a+" "]&&(!q||!q.test(a))){if(1!==x)w=b,s=a;else if("object"!==b.nodeName.toLowerCase()){(k=b.getAttribute("id"))?k=k.replace(aa,"\\$&"):b.setAttribute("id",k=u),r=g(a),h=r.length,l=V.test(k)?"#"+k:"[id='"+k+"']";while(h--)r[h]=l+" "+qa(r[h]);s=r.join(","),w=_.test(a)&&oa(b.parentNode)||b}if(s)try{return H.apply(d,w.querySelectorAll(s)),d}catch(y){}finally{k===u&&b.removeAttribute("id")}}}return i(a.replace(Q,"$1"),b,d,e)}function ga(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ha(a){return a[u]=!0,a}function ia(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function ja(a,b){var c=a.split("|"),e=c.length;while(e--)d.attrHandle[c[e]]=b}function ka(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function la(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function ma(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function na(a){return ha(function(b){return b=+b,ha(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function oa(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=fa.support={},f=fa.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=fa.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=n.documentElement,p=!f(n),(e=n.defaultView)&&e.top!==e&&(e.addEventListener?e.addEventListener("unload",da,!1):e.attachEvent&&e.attachEvent("onunload",da)),c.attributes=ia(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ia(function(a){return a.appendChild(n.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=Z.test(n.getElementsByClassName),c.getById=ia(function(a){return o.appendChild(a).id=u,!n.getElementsByName||!n.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c?[c]:[]}},d.filter.ID=function(a){var b=a.replace(ba,ca);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(ba,ca);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return"undefined"!=typeof b.getElementsByClassName&&p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=Z.test(n.querySelectorAll))&&(ia(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\r\\' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),ia(function(a){var b=n.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=Z.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ia(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",O)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=Z.test(o.compareDocumentPosition),t=b||Z.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===n||a.ownerDocument===v&&t(v,a)?-1:b===n||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,g=[a],h=[b];if(!e||!f)return a===n?-1:b===n?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return ka(a,b);c=a;while(c=c.parentNode)g.unshift(c);c=b;while(c=c.parentNode)h.unshift(c);while(g[d]===h[d])d++;return d?ka(g[d],h[d]):g[d]===v?-1:h[d]===v?1:0},n):n},fa.matches=function(a,b){return fa(a,null,null,b)},fa.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(T,"='$1']"),c.matchesSelector&&p&&!A[b+" "]&&(!r||!r.test(b))&&(!q||!q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return fa(b,n,null,[a]).length>0},fa.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},fa.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},fa.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},fa.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=fa.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=fa.selectors={cacheLength:50,createPseudo:ha,match:W,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(ba,ca),a[3]=(a[3]||a[4]||a[5]||"").replace(ba,ca),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||fa.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&fa.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return W.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&U.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(ba,ca).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=fa.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(P," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h,t=!1;if(q){if(f){while(p){m=b;while(m=m[p])if(h?m.nodeName.toLowerCase()===r:1===m.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){m=q,l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),j=k[a]||[],n=j[0]===w&&j[1],t=n&&j[2],m=n&&q.childNodes[n];while(m=++n&&m&&m[p]||(t=n=0)||o.pop())if(1===m.nodeType&&++t&&m===b){k[a]=[w,n,t];break}}else if(s&&(m=b,l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),j=k[a]||[],n=j[0]===w&&j[1],t=n),t===!1)while(m=++n&&m&&m[p]||(t=n=0)||o.pop())if((h?m.nodeName.toLowerCase()===r:1===m.nodeType)&&++t&&(s&&(l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),k[a]=[w,t]),m===b))break;return t-=e,t===d||t%d===0&&t/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||fa.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ha(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ha(function(a){var b=[],c=[],d=h(a.replace(Q,"$1"));return d[u]?ha(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ha(function(a){return function(b){return fa(a,b).length>0}}),contains:ha(function(a){return a=a.replace(ba,ca),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ha(function(a){return V.test(a||"")||fa.error("unsupported lang: "+a),a=a.replace(ba,ca).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Y.test(a.nodeName)},input:function(a){return X.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:na(function(){return[0]}),last:na(function(a,b){return[b-1]}),eq:na(function(a,b,c){return[0>c?c+b:c]}),even:na(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:na(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:na(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:na(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=la(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=ma(b);function pa(){}pa.prototype=d.filters=d.pseudos,d.setFilters=new pa,g=fa.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){c&&!(e=R.exec(h))||(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=S.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(Q," ")}),h=h.slice(c.length));for(g in d.filter)!(e=W[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?fa.error(a):z(a,i).slice(0)};function qa(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function ra(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j,k=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(j=b[u]||(b[u]={}),i=j[b.uniqueID]||(j[b.uniqueID]={}),(h=i[d])&&h[0]===w&&h[1]===f)return k[2]=h[2];if(i[d]=k,k[2]=a(b,c,g))return!0}}}function sa(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ta(a,b,c){for(var d=0,e=b.length;e>d;d++)fa(a,b[d],c);return c}function ua(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(c&&!c(f,d,e)||(g.push(f),j&&b.push(h)));return g}function va(a,b,c,d,e,f){return d&&!d[u]&&(d=va(d)),e&&!e[u]&&(e=va(e,f)),ha(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ta(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:ua(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=ua(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=ua(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function wa(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=ra(function(a){return a===b},h,!0),l=ra(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[ra(sa(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return va(i>1&&sa(m),i>1&&qa(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(Q,"$1"),c,e>i&&wa(a.slice(i,e)),f>e&&wa(a=a.slice(e)),f>e&&qa(a))}m.push(c)}return sa(m)}function xa(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,o,q,r=0,s="0",t=f&&[],u=[],v=j,x=f||e&&d.find.TAG("*",k),y=w+=null==v?1:Math.random()||.1,z=x.length;for(k&&(j=g===n||g||k);s!==z&&null!=(l=x[s]);s++){if(e&&l){o=0,g||l.ownerDocument===n||(m(l),h=!p);while(q=a[o++])if(q(l,g||n,h)){i.push(l);break}k&&(w=y)}c&&((l=!q&&l)&&r--,f&&t.push(l))}if(r+=s,c&&s!==r){o=0;while(q=b[o++])q(t,u,g,h);if(f){if(r>0)while(s--)t[s]||u[s]||(u[s]=F.call(i));u=ua(u)}H.apply(i,u),k&&!f&&u.length>0&&r+b.length>1&&fa.uniqueSort(i)}return k&&(w=y,j=v),t};return c?ha(f):f}return h=fa.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=wa(b[c]),f[u]?d.push(f):e.push(f);f=A(a,xa(e,d)),f.selector=a}return f},i=fa.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(ba,ca),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=W.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(ba,ca),_.test(j[0].type)&&oa(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&qa(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,!b||_.test(a)&&oa(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ia(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ia(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||ja("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ia(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||ja("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ia(function(a){return null==a.getAttribute("disabled")})||ja(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),fa}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.uniqueSort=n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},v=function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c},w=n.expr.match.needsContext,x=/^<([\w-]+)\s*\/?>(?:<\/\1>|)$/,y=/^.[^:#\[\.,]*$/;function z(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(y.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return n.inArray(a,b)>-1!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=[],d=this,e=d.length;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;e>b;b++)if(n.contains(d[b],this))return!0}));for(b=0;e>b;b++)n.find(a,d[b],c);return c=this.pushStack(e>1?n.unique(c):c),c.selector=this.selector?this.selector+" "+a:a,c},filter:function(a){return this.pushStack(z(this,a||[],!1))},not:function(a){return this.pushStack(z(this,a||[],!0))},is:function(a){return!!z(this,"string"==typeof a&&w.test(a)?n(a):a||[],!1).length}});var A,B=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,C=n.fn.init=function(a,b,c){var e,f;if(!a)return this;if(c=c||A,"string"==typeof a){if(e="<"===a.charAt(0)&&">"===a.charAt(a.length-1)&&a.length>=3?[null,a,null]:B.exec(a),!e||!e[1]&&b)return!b||b.jquery?(b||c).find(a):this.constructor(b).find(a);if(e[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(e[1],b&&b.nodeType?b.ownerDocument||b:d,!0)),x.test(e[1])&&n.isPlainObject(b))for(e in b)n.isFunction(this[e])?this[e](b[e]):this.attr(e,b[e]);return this}if(f=d.getElementById(e[2]),f&&f.parentNode){if(f.id!==e[2])return A.find(a);this.length=1,this[0]=f}return this.context=d,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?"undefined"!=typeof c.ready?c.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};C.prototype=n.fn,A=n(d);var D=/^(?:parents|prev(?:Until|All))/,E={children:!0,contents:!0,next:!0,prev:!0};n.fn.extend({has:function(a){var b,c=n(a,this),d=c.length;return this.filter(function(){for(b=0;d>b;b++)if(n.contains(this,c[b]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=w.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.uniqueSort(f):f)},index:function(a){return a?"string"==typeof a?n.inArray(this[0],n(a)):n.inArray(a.jquery?a[0]:a,this):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.uniqueSort(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function F(a,b){do a=a[b];while(a&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return u(a,"parentNode")},parentsUntil:function(a,b,c){return u(a,"parentNode",c)},next:function(a){return F(a,"nextSibling")},prev:function(a){return F(a,"previousSibling")},nextAll:function(a){return u(a,"nextSibling")},prevAll:function(a){return u(a,"previousSibling")},nextUntil:function(a,b,c){return u(a,"nextSibling",c)},prevUntil:function(a,b,c){return u(a,"previousSibling",c)},siblings:function(a){return v((a.parentNode||{}).firstChild,a)},children:function(a){return v(a.firstChild)},contents:function(a){return n.nodeName(a,"iframe")?a.contentDocument||a.contentWindow.document:n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(E[a]||(e=n.uniqueSort(e)),D.test(a)&&(e=e.reverse())),this.pushStack(e)}});var G=/\S+/g;function H(a){var b={};return n.each(a.match(G)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?H(a):n.extend({},a);var b,c,d,e,f=[],g=[],h=-1,i=function(){for(e=a.once,d=b=!0;g.length;h=-1){c=g.shift();while(++h<f.length)f[h].apply(c[0],c[1])===!1&&a.stopOnFalse&&(h=f.length,c=!1)}a.memory||(c=!1),b=!1,e&&(f=c?[]:"")},j={add:function(){return f&&(c&&!b&&(h=f.length-1,g.push(c)),function d(b){n.each(b,function(b,c){n.isFunction(c)?a.unique&&j.has(c)||f.push(c):c&&c.length&&"string"!==n.type(c)&&d(c)})}(arguments),c&&!b&&i()),this},remove:function(){return n.each(arguments,function(a,b){var c;while((c=n.inArray(b,f,c))>-1)f.splice(c,1),h>=c&&h--}),this},has:function(a){return a?n.inArray(a,f)>-1:f.length>0},empty:function(){return f&&(f=[]),this},disable:function(){return e=g=[],f=c="",this},disabled:function(){return!f},lock:function(){return e=!0,c||j.disable(),this},locked:function(){return!!e},fireWith:function(a,c){return e||(c=c||[],c=[a,c.slice?c.slice():c],g.push(c),b||i()),this},fire:function(){return j.fireWith(this,arguments),this},fired:function(){return!!d}};return j},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().progress(c.notify).done(c.resolve).fail(c.reject):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=e.call(arguments),d=c.length,f=1!==d||a&&n.isFunction(a.promise)?d:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(d){b[a]=this,c[a]=arguments.length>1?e.call(arguments):d,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(d>1)for(i=new Array(d),j=new Array(d),k=new Array(d);d>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().progress(h(b,j,i)).done(h(b,k,c)).fail(g.reject):--f;return f||g.resolveWith(k,c),g.promise()}});var I;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(I.resolveWith(d,[n]),n.fn.triggerHandler&&(n(d).triggerHandler("ready"),n(d).off("ready"))))}});function J(){d.addEventListener?(d.removeEventListener("DOMContentLoaded",K),a.removeEventListener("load",K)):(d.detachEvent("onreadystatechange",K),a.detachEvent("onload",K))}function K(){(d.addEventListener||"load"===a.event.type||"complete"===d.readyState)&&(J(),n.ready())}n.ready.promise=function(b){if(!I)if(I=n.Deferred(),"complete"===d.readyState||"loading"!==d.readyState&&!d.documentElement.doScroll)a.setTimeout(n.ready);else if(d.addEventListener)d.addEventListener("DOMContentLoaded",K),a.addEventListener("load",K);else{d.attachEvent("onreadystatechange",K),a.attachEvent("onload",K);var c=!1;try{c=null==a.frameElement&&d.documentElement}catch(e){}c&&c.doScroll&&!function f(){if(!n.isReady){try{c.doScroll("left")}catch(b){return a.setTimeout(f,50)}J(),n.ready()}}()}return I.promise(b)},n.ready.promise();var L;for(L in n(l))break;l.ownFirst="0"===L,l.inlineBlockNeedsLayout=!1,n(function(){var a,b,c,e;c=d.getElementsByTagName("body")[0],c&&c.style&&(b=d.createElement("div"),e=d.createElement("div"),e.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(e).appendChild(b),"undefined"!=typeof b.style.zoom&&(b.style.cssText="display:inline;margin:0;border:0;padding:1px;width:1px;zoom:1",l.inlineBlockNeedsLayout=a=3===b.offsetWidth,a&&(c.style.zoom=1)),c.removeChild(e))}),function(){var a=d.createElement("div");l.deleteExpando=!0;try{delete a.test}catch(b){l.deleteExpando=!1}a=null}();var M=function(a){var b=n.noData[(a.nodeName+" ").toLowerCase()],c=+a.nodeType||1;return 1!==c&&9!==c?!1:!b||b!==!0&&a.getAttribute("classid")===b},N=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,O=/([A-Z])/g;function P(a,b,c){if(void 0===c&&1===a.nodeType){var d="data-"+b.replace(O,"-$1").toLowerCase();if(c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:N.test(c)?n.parseJSON(c):c}catch(e){}n.data(a,b,c)}else c=void 0;
    }return c}function Q(a){var b;for(b in a)if(("data"!==b||!n.isEmptyObject(a[b]))&&"toJSON"!==b)return!1;return!0}function R(a,b,d,e){if(M(a)){var f,g,h=n.expando,i=a.nodeType,j=i?n.cache:a,k=i?a[h]:a[h]&&h;if(k&&j[k]&&(e||j[k].data)||void 0!==d||"string"!=typeof b)return k||(k=i?a[h]=c.pop()||n.guid++:h),j[k]||(j[k]=i?{}:{toJSON:n.noop}),"object"!=typeof b&&"function"!=typeof b||(e?j[k]=n.extend(j[k],b):j[k].data=n.extend(j[k].data,b)),g=j[k],e||(g.data||(g.data={}),g=g.data),void 0!==d&&(g[n.camelCase(b)]=d),"string"==typeof b?(f=g[b],null==f&&(f=g[n.camelCase(b)])):f=g,f}}function S(a,b,c){if(M(a)){var d,e,f=a.nodeType,g=f?n.cache:a,h=f?a[n.expando]:n.expando;if(g[h]){if(b&&(d=c?g[h]:g[h].data)){n.isArray(b)?b=b.concat(n.map(b,n.camelCase)):b in d?b=[b]:(b=n.camelCase(b),b=b in d?[b]:b.split(" ")),e=b.length;while(e--)delete d[b[e]];if(c?!Q(d):!n.isEmptyObject(d))return}(c||(delete g[h].data,Q(g[h])))&&(f?n.cleanData([a],!0):l.deleteExpando||g!=g.window?delete g[h]:g[h]=void 0)}}}n.extend({cache:{},noData:{"applet ":!0,"embed ":!0,"object ":"clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"},hasData:function(a){return a=a.nodeType?n.cache[a[n.expando]]:a[n.expando],!!a&&!Q(a)},data:function(a,b,c){return R(a,b,c)},removeData:function(a,b){return S(a,b)},_data:function(a,b,c){return R(a,b,c,!0)},_removeData:function(a,b){return S(a,b,!0)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=n.data(f),1===f.nodeType&&!n._data(f,"parsedAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),P(f,d,e[d])));n._data(f,"parsedAttrs",!0)}return e}return"object"==typeof a?this.each(function(){n.data(this,a)}):arguments.length>1?this.each(function(){n.data(this,a,b)}):f?P(f,a,n.data(f,a)):void 0},removeData:function(a){return this.each(function(){n.removeData(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=n._data(a,b),c&&(!d||n.isArray(c)?d=n._data(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return n._data(a,c)||n._data(a,c,{empty:n.Callbacks("once memory").add(function(){n._removeData(a,b+"queue"),n._removeData(a,c)})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=n._data(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}}),function(){var a;l.shrinkWrapBlocks=function(){if(null!=a)return a;a=!1;var b,c,e;return c=d.getElementsByTagName("body")[0],c&&c.style?(b=d.createElement("div"),e=d.createElement("div"),e.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(e).appendChild(b),"undefined"!=typeof b.style.zoom&&(b.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:1px;width:1px;zoom:1",b.appendChild(d.createElement("div")).style.width="5px",a=3!==b.offsetWidth),c.removeChild(e),a):void 0}}();var T=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,U=new RegExp("^(?:([+-])=|)("+T+")([a-z%]*)$","i"),V=["Top","Right","Bottom","Left"],W=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)};function X(a,b,c,d){var e,f=1,g=20,h=d?function(){return d.cur()}:function(){return n.css(a,b,"")},i=h(),j=c&&c[3]||(n.cssNumber[b]?"":"px"),k=(n.cssNumber[b]||"px"!==j&&+i)&&U.exec(n.css(a,b));if(k&&k[3]!==j){j=j||k[3],c=c||[],k=+i||1;do f=f||".5",k/=f,n.style(a,b,k+j);while(f!==(f=h()/i)&&1!==f&&--g)}return c&&(k=+k||+i||0,e=c[1]?k+(c[1]+1)*c[2]:+c[2],d&&(d.unit=j,d.start=k,d.end=e)),e}var Y=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)Y(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f},Z=/^(?:checkbox|radio)$/i,$=/<([\w:-]+)/,_=/^$|\/(?:java|ecma)script/i,aa=/^\s+/,ba="abbr|article|aside|audio|bdi|canvas|data|datalist|details|dialog|figcaption|figure|footer|header|hgroup|main|mark|meter|nav|output|picture|progress|section|summary|template|time|video";function ca(a){var b=ba.split("|"),c=a.createDocumentFragment();if(c.createElement)while(b.length)c.createElement(b.pop());return c}!function(){var a=d.createElement("div"),b=d.createDocumentFragment(),c=d.createElement("input");a.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",l.leadingWhitespace=3===a.firstChild.nodeType,l.tbody=!a.getElementsByTagName("tbody").length,l.htmlSerialize=!!a.getElementsByTagName("link").length,l.html5Clone="<:nav></:nav>"!==d.createElement("nav").cloneNode(!0).outerHTML,c.type="checkbox",c.checked=!0,b.appendChild(c),l.appendChecked=c.checked,a.innerHTML="<textarea>x</textarea>",l.noCloneChecked=!!a.cloneNode(!0).lastChild.defaultValue,b.appendChild(a),c=d.createElement("input"),c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),a.appendChild(c),l.checkClone=a.cloneNode(!0).cloneNode(!0).lastChild.checked,l.noCloneEvent=!!a.addEventListener,a[n.expando]=1,l.attributes=!a.getAttribute(n.expando)}();var da={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],area:[1,"<map>","</map>"],param:[1,"<object>","</object>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:l.htmlSerialize?[0,"",""]:[1,"X<div>","</div>"]};da.optgroup=da.option,da.tbody=da.tfoot=da.colgroup=da.caption=da.thead,da.th=da.td;function ea(a,b){var c,d,e=0,f="undefined"!=typeof a.getElementsByTagName?a.getElementsByTagName(b||"*"):"undefined"!=typeof a.querySelectorAll?a.querySelectorAll(b||"*"):void 0;if(!f)for(f=[],c=a.childNodes||a;null!=(d=c[e]);e++)!b||n.nodeName(d,b)?f.push(d):n.merge(f,ea(d,b));return void 0===b||b&&n.nodeName(a,b)?n.merge([a],f):f}function fa(a,b){for(var c,d=0;null!=(c=a[d]);d++)n._data(c,"globalEval",!b||n._data(b[d],"globalEval"))}var ga=/<|&#?\w+;/,ha=/<tbody/i;function ia(a){Z.test(a.type)&&(a.defaultChecked=a.checked)}function ja(a,b,c,d,e){for(var f,g,h,i,j,k,m,o=a.length,p=ca(b),q=[],r=0;o>r;r++)if(g=a[r],g||0===g)if("object"===n.type(g))n.merge(q,g.nodeType?[g]:g);else if(ga.test(g)){i=i||p.appendChild(b.createElement("div")),j=($.exec(g)||["",""])[1].toLowerCase(),m=da[j]||da._default,i.innerHTML=m[1]+n.htmlPrefilter(g)+m[2],f=m[0];while(f--)i=i.lastChild;if(!l.leadingWhitespace&&aa.test(g)&&q.push(b.createTextNode(aa.exec(g)[0])),!l.tbody){g="table"!==j||ha.test(g)?"<table>"!==m[1]||ha.test(g)?0:i:i.firstChild,f=g&&g.childNodes.length;while(f--)n.nodeName(k=g.childNodes[f],"tbody")&&!k.childNodes.length&&g.removeChild(k)}n.merge(q,i.childNodes),i.textContent="";while(i.firstChild)i.removeChild(i.firstChild);i=p.lastChild}else q.push(b.createTextNode(g));i&&p.removeChild(i),l.appendChecked||n.grep(ea(q,"input"),ia),r=0;while(g=q[r++])if(d&&n.inArray(g,d)>-1)e&&e.push(g);else if(h=n.contains(g.ownerDocument,g),i=ea(p.appendChild(g),"script"),h&&fa(i),c){f=0;while(g=i[f++])_.test(g.type||"")&&c.push(g)}return i=null,p}!function(){var b,c,e=d.createElement("div");for(b in{submit:!0,change:!0,focusin:!0})c="on"+b,(l[b]=c in a)||(e.setAttribute(c,"t"),l[b]=e.attributes[c].expando===!1);e=null}();var ka=/^(?:input|select|textarea)$/i,la=/^key/,ma=/^(?:mouse|pointer|contextmenu|drag|drop)|click/,na=/^(?:focusinfocus|focusoutblur)$/,oa=/^([^.]*)(?:\.(.+)|)/;function pa(){return!0}function qa(){return!1}function ra(){try{return d.activeElement}catch(a){}}function sa(a,b,c,d,e,f){var g,h;if("object"==typeof b){"string"!=typeof c&&(d=d||c,c=void 0);for(h in b)sa(a,h,c,d,b[h],f);return a}if(null==d&&null==e?(e=c,d=c=void 0):null==e&&("string"==typeof c?(e=d,d=void 0):(e=d,d=c,c=void 0)),e===!1)e=qa;else if(!e)return a;return 1===f&&(g=e,e=function(a){return n().off(a),g.apply(this,arguments)},e.guid=g.guid||(g.guid=n.guid++)),a.each(function(){n.event.add(this,b,e,d,c)})}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=n._data(a);if(r){c.handler&&(i=c,c=i.handler,e=i.selector),c.guid||(c.guid=n.guid++),(g=r.events)||(g=r.events={}),(k=r.handle)||(k=r.handle=function(a){return"undefined"==typeof n||a&&n.event.triggered===a.type?void 0:n.event.dispatch.apply(k.elem,arguments)},k.elem=a),b=(b||"").match(G)||[""],h=b.length;while(h--)f=oa.exec(b[h])||[],o=q=f[1],p=(f[2]||"").split(".").sort(),o&&(j=n.event.special[o]||{},o=(e?j.delegateType:j.bindType)||o,j=n.event.special[o]||{},l=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},i),(m=g[o])||(m=g[o]=[],m.delegateCount=0,j.setup&&j.setup.call(a,d,p,k)!==!1||(a.addEventListener?a.addEventListener(o,k,!1):a.attachEvent&&a.attachEvent("on"+o,k))),j.add&&(j.add.call(a,l),l.handler.guid||(l.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,l):m.push(l),n.event.global[o]=!0);a=null}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=n.hasData(a)&&n._data(a);if(r&&(k=r.events)){b=(b||"").match(G)||[""],j=b.length;while(j--)if(h=oa.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=k[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),i=f=m.length;while(f--)g=m[f],!e&&q!==g.origType||c&&c.guid!==g.guid||h&&!h.test(g.namespace)||d&&d!==g.selector&&("**"!==d||!g.selector)||(m.splice(f,1),g.selector&&m.delegateCount--,l.remove&&l.remove.call(a,g));i&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete k[o])}else for(o in k)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(k)&&(delete r.handle,n._removeData(a,"events"))}},trigger:function(b,c,e,f){var g,h,i,j,l,m,o,p=[e||d],q=k.call(b,"type")?b.type:b,r=k.call(b,"namespace")?b.namespace.split("."):[];if(i=m=e=e||d,3!==e.nodeType&&8!==e.nodeType&&!na.test(q+n.event.triggered)&&(q.indexOf(".")>-1&&(r=q.split("."),q=r.shift(),r.sort()),h=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=f?2:3,b.namespace=r.join("."),b.rnamespace=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=e),c=null==c?[b]:n.makeArray(c,[b]),l=n.event.special[q]||{},f||!l.trigger||l.trigger.apply(e,c)!==!1)){if(!f&&!l.noBubble&&!n.isWindow(e)){for(j=l.delegateType||q,na.test(j+q)||(i=i.parentNode);i;i=i.parentNode)p.push(i),m=i;m===(e.ownerDocument||d)&&p.push(m.defaultView||m.parentWindow||a)}o=0;while((i=p[o++])&&!b.isPropagationStopped())b.type=o>1?j:l.bindType||q,g=(n._data(i,"events")||{})[b.type]&&n._data(i,"handle"),g&&g.apply(i,c),g=h&&i[h],g&&g.apply&&M(i)&&(b.result=g.apply(i,c),b.result===!1&&b.preventDefault());if(b.type=q,!f&&!b.isDefaultPrevented()&&(!l._default||l._default.apply(p.pop(),c)===!1)&&M(e)&&h&&e[q]&&!n.isWindow(e)){m=e[h],m&&(e[h]=null),n.event.triggered=q;try{e[q]()}catch(s){}n.event.triggered=void 0,m&&(e[h]=m)}return b.result}},dispatch:function(a){a=n.event.fix(a);var b,c,d,f,g,h=[],i=e.call(arguments),j=(n._data(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())a.rnamespace&&!a.rnamespace.test(g.namespace)||(a.handleObj=g,a.data=g.data,d=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==d&&(a.result=d)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&("click"!==a.type||isNaN(a.button)||a.button<1))for(;i!=this;i=i.parentNode||this)if(1===i.nodeType&&(i.disabled!==!0||"click"!==a.type)){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>-1:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},fix:function(a){if(a[n.expando])return a;var b,c,e,f=a.type,g=a,h=this.fixHooks[f];h||(this.fixHooks[f]=h=ma.test(f)?this.mouseHooks:la.test(f)?this.keyHooks:{}),e=h.props?this.props.concat(h.props):this.props,a=new n.Event(g),b=e.length;while(b--)c=e[b],a[c]=g[c];return a.target||(a.target=g.srcElement||d),3===a.target.nodeType&&(a.target=a.target.parentNode),a.metaKey=!!a.metaKey,h.filter?h.filter(a,g):a},props:"altKey bubbles cancelable ctrlKey currentTarget detail eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,e,f,g=b.button,h=b.fromElement;return null==a.pageX&&null!=b.clientX&&(e=a.target.ownerDocument||d,f=e.documentElement,c=e.body,a.pageX=b.clientX+(f&&f.scrollLeft||c&&c.scrollLeft||0)-(f&&f.clientLeft||c&&c.clientLeft||0),a.pageY=b.clientY+(f&&f.scrollTop||c&&c.scrollTop||0)-(f&&f.clientTop||c&&c.clientTop||0)),!a.relatedTarget&&h&&(a.relatedTarget=h===a.target?b.toElement:h),a.which||void 0===g||(a.which=1&g?1:2&g?3:4&g?2:0),a}},special:{load:{noBubble:!0},focus:{trigger:function(){if(this!==ra()&&this.focus)try{return this.focus(),!1}catch(a){}},delegateType:"focusin"},blur:{trigger:function(){return this===ra()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return n.nodeName(this,"input")&&"checkbox"===this.type&&this.click?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c){var d=n.extend(new n.Event,c,{type:a,isSimulated:!0});n.event.trigger(d,null,b),d.isDefaultPrevented()&&c.preventDefault()}},n.removeEvent=d.removeEventListener?function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c)}:function(a,b,c){var d="on"+b;a.detachEvent&&("undefined"==typeof a[d]&&(a[d]=null),a.detachEvent(d,c))},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?pa:qa):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={constructor:n.Event,isDefaultPrevented:qa,isPropagationStopped:qa,isImmediatePropagationStopped:qa,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=pa,a&&(a.preventDefault?a.preventDefault():a.returnValue=!1)},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=pa,a&&!this.isSimulated&&(a.stopPropagation&&a.stopPropagation(),a.cancelBubble=!0)},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=pa,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return e&&(e===d||n.contains(d,e))||(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),l.submit||(n.event.special.submit={setup:function(){return n.nodeName(this,"form")?!1:void n.event.add(this,"click._submit keypress._submit",function(a){var b=a.target,c=n.nodeName(b,"input")||n.nodeName(b,"button")?n.prop(b,"form"):void 0;c&&!n._data(c,"submit")&&(n.event.add(c,"submit._submit",function(a){a._submitBubble=!0}),n._data(c,"submit",!0))})},postDispatch:function(a){a._submitBubble&&(delete a._submitBubble,this.parentNode&&!a.isTrigger&&n.event.simulate("submit",this.parentNode,a))},teardown:function(){return n.nodeName(this,"form")?!1:void n.event.remove(this,"._submit")}}),l.change||(n.event.special.change={setup:function(){return ka.test(this.nodeName)?("checkbox"!==this.type&&"radio"!==this.type||(n.event.add(this,"propertychange._change",function(a){"checked"===a.originalEvent.propertyName&&(this._justChanged=!0)}),n.event.add(this,"click._change",function(a){this._justChanged&&!a.isTrigger&&(this._justChanged=!1),n.event.simulate("change",this,a)})),!1):void n.event.add(this,"beforeactivate._change",function(a){var b=a.target;ka.test(b.nodeName)&&!n._data(b,"change")&&(n.event.add(b,"change._change",function(a){!this.parentNode||a.isSimulated||a.isTrigger||n.event.simulate("change",this.parentNode,a)}),n._data(b,"change",!0))})},handle:function(a){var b=a.target;return this!==b||a.isSimulated||a.isTrigger||"radio"!==b.type&&"checkbox"!==b.type?a.handleObj.handler.apply(this,arguments):void 0},teardown:function(){return n.event.remove(this,"._change"),!ka.test(this.nodeName)}}),l.focusin||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a))};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=n._data(d,b);e||d.addEventListener(a,c,!0),n._data(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=n._data(d,b)-1;e?n._data(d,b,e):(d.removeEventListener(a,c,!0),n._removeData(d,b))}}}),n.fn.extend({on:function(a,b,c,d){return sa(this,a,b,c,d)},one:function(a,b,c,d){return sa(this,a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return b!==!1&&"function"!=typeof b||(c=b,b=void 0),c===!1&&(c=qa),this.each(function(){n.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}});var ta=/ jQuery\d+="(?:null|\d+)"/g,ua=new RegExp("<(?:"+ba+")[\\s/>]","i"),va=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:-]+)[^>]*)\/>/gi,wa=/<script|<style|<link/i,xa=/checked\s*(?:[^=]|=\s*.checked.)/i,ya=/^true\/(.*)/,za=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,Aa=ca(d),Ba=Aa.appendChild(d.createElement("div"));function Ca(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function Da(a){return a.type=(null!==n.find.attr(a,"type"))+"/"+a.type,a}function Ea(a){var b=ya.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function Fa(a,b){if(1===b.nodeType&&n.hasData(a)){var c,d,e,f=n._data(a),g=n._data(b,f),h=f.events;if(h){delete g.handle,g.events={};for(c in h)for(d=0,e=h[c].length;e>d;d++)n.event.add(b,c,h[c][d])}g.data&&(g.data=n.extend({},g.data))}}function Ga(a,b){var c,d,e;if(1===b.nodeType){if(c=b.nodeName.toLowerCase(),!l.noCloneEvent&&b[n.expando]){e=n._data(b);for(d in e.events)n.removeEvent(b,d,e.handle);b.removeAttribute(n.expando)}"script"===c&&b.text!==a.text?(Da(b).text=a.text,Ea(b)):"object"===c?(b.parentNode&&(b.outerHTML=a.outerHTML),l.html5Clone&&a.innerHTML&&!n.trim(b.innerHTML)&&(b.innerHTML=a.innerHTML)):"input"===c&&Z.test(a.type)?(b.defaultChecked=b.checked=a.checked,b.value!==a.value&&(b.value=a.value)):"option"===c?b.defaultSelected=b.selected=a.defaultSelected:"input"!==c&&"textarea"!==c||(b.defaultValue=a.defaultValue)}}function Ha(a,b,c,d){b=f.apply([],b);var e,g,h,i,j,k,m=0,o=a.length,p=o-1,q=b[0],r=n.isFunction(q);if(r||o>1&&"string"==typeof q&&!l.checkClone&&xa.test(q))return a.each(function(e){var f=a.eq(e);r&&(b[0]=q.call(this,e,f.html())),Ha(f,b,c,d)});if(o&&(k=ja(b,a[0].ownerDocument,!1,a,d),e=k.firstChild,1===k.childNodes.length&&(k=e),e||d)){for(i=n.map(ea(k,"script"),Da),h=i.length;o>m;m++)g=k,m!==p&&(g=n.clone(g,!0,!0),h&&n.merge(i,ea(g,"script"))),c.call(a[m],g,m);if(h)for(j=i[i.length-1].ownerDocument,n.map(i,Ea),m=0;h>m;m++)g=i[m],_.test(g.type||"")&&!n._data(g,"globalEval")&&n.contains(j,g)&&(g.src?n._evalUrl&&n._evalUrl(g.src):n.globalEval((g.text||g.textContent||g.innerHTML||"").replace(za,"")));k=e=null}return a}function Ia(a,b,c){for(var d,e=b?n.filter(b,a):a,f=0;null!=(d=e[f]);f++)c||1!==d.nodeType||n.cleanData(ea(d)),d.parentNode&&(c&&n.contains(d.ownerDocument,d)&&fa(ea(d,"script")),d.parentNode.removeChild(d));return a}n.extend({htmlPrefilter:function(a){return a.replace(va,"<$1></$2>")},clone:function(a,b,c){var d,e,f,g,h,i=n.contains(a.ownerDocument,a);if(l.html5Clone||n.isXMLDoc(a)||!ua.test("<"+a.nodeName+">")?f=a.cloneNode(!0):(Ba.innerHTML=a.outerHTML,Ba.removeChild(f=Ba.firstChild)),!(l.noCloneEvent&&l.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(d=ea(f),h=ea(a),g=0;null!=(e=h[g]);++g)d[g]&&Ga(e,d[g]);if(b)if(c)for(h=h||ea(a),d=d||ea(f),g=0;null!=(e=h[g]);g++)Fa(e,d[g]);else Fa(a,f);return d=ea(f,"script"),d.length>0&&fa(d,!i&&ea(a,"script")),d=h=e=null,f},cleanData:function(a,b){for(var d,e,f,g,h=0,i=n.expando,j=n.cache,k=l.attributes,m=n.event.special;null!=(d=a[h]);h++)if((b||M(d))&&(f=d[i],g=f&&j[f])){if(g.events)for(e in g.events)m[e]?n.event.remove(d,e):n.removeEvent(d,e,g.handle);j[f]&&(delete j[f],k||"undefined"==typeof d.removeAttribute?d[i]=void 0:d.removeAttribute(i),c.push(f))}}}),n.fn.extend({domManip:Ha,detach:function(a){return Ia(this,a,!0)},remove:function(a){return Ia(this,a)},text:function(a){return Y(this,function(a){return void 0===a?n.text(this):this.empty().append((this[0]&&this[0].ownerDocument||d).createTextNode(a))},null,a,arguments.length)},append:function(){return Ha(this,arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=Ca(this,a);b.appendChild(a)}})},prepend:function(){return Ha(this,arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=Ca(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return Ha(this,arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return Ha(this,arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},empty:function(){for(var a,b=0;null!=(a=this[b]);b++){1===a.nodeType&&n.cleanData(ea(a,!1));while(a.firstChild)a.removeChild(a.firstChild);a.options&&n.nodeName(a,"select")&&(a.options.length=0)}return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return Y(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a)return 1===b.nodeType?b.innerHTML.replace(ta,""):void 0;if("string"==typeof a&&!wa.test(a)&&(l.htmlSerialize||!ua.test(a))&&(l.leadingWhitespace||!aa.test(a))&&!da[($.exec(a)||["",""])[1].toLowerCase()]){a=n.htmlPrefilter(a);try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(ea(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=[];return Ha(this,arguments,function(b){var c=this.parentNode;n.inArray(this,a)<0&&(n.cleanData(ea(this)),c&&c.replaceChild(b,this))},a)}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=0,e=[],f=n(a),h=f.length-1;h>=d;d++)c=d===h?this:this.clone(!0),n(f[d])[b](c),g.apply(e,c.get());return this.pushStack(e)}});var Ja,Ka={HTML:"block",BODY:"block"};function La(a,b){var c=n(b.createElement(a)).appendTo(b.body),d=n.css(c[0],"display");return c.detach(),d}function Ma(a){var b=d,c=Ka[a];return c||(c=La(a,b),"none"!==c&&c||(Ja=(Ja||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=(Ja[0].contentWindow||Ja[0].contentDocument).document,b.write(),b.close(),c=La(a,b),Ja.detach()),Ka[a]=c),c}var Na=/^margin/,Oa=new RegExp("^("+T+")(?!px)[a-z%]+$","i"),Pa=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e},Qa=d.documentElement;!function(){var b,c,e,f,g,h,i=d.createElement("div"),j=d.createElement("div");if(j.style){j.style.cssText="float:left;opacity:.5",l.opacity="0.5"===j.style.opacity,l.cssFloat=!!j.style.cssFloat,j.style.backgroundClip="content-box",j.cloneNode(!0).style.backgroundClip="",l.clearCloneStyle="content-box"===j.style.backgroundClip,i=d.createElement("div"),i.style.cssText="border:0;width:8px;height:0;top:0;left:-9999px;padding:0;margin-top:1px;position:absolute",j.innerHTML="",i.appendChild(j),l.boxSizing=""===j.style.boxSizing||""===j.style.MozBoxSizing||""===j.style.WebkitBoxSizing,n.extend(l,{reliableHiddenOffsets:function(){return null==b&&k(),f},boxSizingReliable:function(){return null==b&&k(),e},pixelMarginRight:function(){return null==b&&k(),c},pixelPosition:function(){return null==b&&k(),b},reliableMarginRight:function(){return null==b&&k(),g},reliableMarginLeft:function(){return null==b&&k(),h}});function k(){var k,l,m=d.documentElement;m.appendChild(i),j.style.cssText="-webkit-box-sizing:border-box;box-sizing:border-box;position:relative;display:block;margin:auto;border:1px;padding:1px;top:1%;width:50%",b=e=h=!1,c=g=!0,a.getComputedStyle&&(l=a.getComputedStyle(j),b="1%"!==(l||{}).top,h="2px"===(l||{}).marginLeft,e="4px"===(l||{width:"4px"}).width,j.style.marginRight="50%",c="4px"===(l||{marginRight:"4px"}).marginRight,k=j.appendChild(d.createElement("div")),k.style.cssText=j.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",k.style.marginRight=k.style.width="0",j.style.width="1px",g=!parseFloat((a.getComputedStyle(k)||{}).marginRight),j.removeChild(k)),j.style.display="none",f=0===j.getClientRects().length,f&&(j.style.display="",j.innerHTML="<table><tr><td></td><td>t</td></tr></table>",j.childNodes[0].style.borderCollapse="separate",k=j.getElementsByTagName("td"),k[0].style.cssText="margin:0;border:0;padding:0;display:none",f=0===k[0].offsetHeight,f&&(k[0].style.display="",k[1].style.display="none",f=0===k[0].offsetHeight)),m.removeChild(i)}}}();var Ra,Sa,Ta=/^(top|right|bottom|left)$/;a.getComputedStyle?(Ra=function(b){var c=b.ownerDocument.defaultView;return c&&c.opener||(c=a),c.getComputedStyle(b)},Sa=function(a,b,c){var d,e,f,g,h=a.style;return c=c||Ra(a),g=c?c.getPropertyValue(b)||c[b]:void 0,""!==g&&void 0!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),c&&!l.pixelMarginRight()&&Oa.test(g)&&Na.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f),void 0===g?g:g+""}):Qa.currentStyle&&(Ra=function(a){return a.currentStyle},Sa=function(a,b,c){var d,e,f,g,h=a.style;return c=c||Ra(a),g=c?c[b]:void 0,null==g&&h&&h[b]&&(g=h[b]),Oa.test(g)&&!Ta.test(b)&&(d=h.left,e=a.runtimeStyle,f=e&&e.left,f&&(e.left=a.currentStyle.left),h.left="fontSize"===b?"1em":g,g=h.pixelLeft+"px",h.left=d,f&&(e.left=f)),void 0===g?g:g+""||"auto"});function Ua(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}var Va=/alpha\([^)]*\)/i,Wa=/opacity\s*=\s*([^)]*)/i,Xa=/^(none|table(?!-c[ea]).+)/,Ya=new RegExp("^("+T+")(.*)$","i"),Za={position:"absolute",visibility:"hidden",display:"block"},$a={letterSpacing:"0",fontWeight:"400"},_a=["Webkit","O","Moz","ms"],ab=d.createElement("div").style;function bb(a){if(a in ab)return a;var b=a.charAt(0).toUpperCase()+a.slice(1),c=_a.length;while(c--)if(a=_a[c]+b,a in ab)return a}function cb(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=n._data(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&W(d)&&(f[g]=n._data(d,"olddisplay",Ma(d.nodeName)))):(e=W(d),(c&&"none"!==c||!e)&&n._data(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}function db(a,b,c){var d=Ya.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function eb(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+V[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+V[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+V[f]+"Width",!0,e))):(g+=n.css(a,"padding"+V[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+V[f]+"Width",!0,e)));return g}function fb(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=Ra(a),g=l.boxSizing&&"border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=Sa(a,b,f),(0>e||null==e)&&(e=a.style[b]),Oa.test(e))return e;d=g&&(l.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+eb(a,b,c||(g?"border":"content"),d,f)+"px"}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=Sa(a,"opacity");return""===c?"1":c}}}},cssNumber:{animationIterationCount:!0,columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":l.cssFloat?"cssFloat":"styleFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;if(b=n.cssProps[h]||(n.cssProps[h]=bb(h)||h),g=n.cssHooks[b]||n.cssHooks[h],void 0===c)return g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b];if(f=typeof c,"string"===f&&(e=U.exec(c))&&e[1]&&(c=X(a,b,e),f="number"),null!=c&&c===c&&("number"===f&&(c+=e&&e[3]||(n.cssNumber[h]?"":"px")),l.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),!(g&&"set"in g&&void 0===(c=g.set(a,c,d)))))try{i[b]=c}catch(j){}}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=bb(h)||h),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(f=g.get(a,!0,c)),void 0===f&&(f=Sa(a,b,d)),"normal"===f&&b in $a&&(f=$a[b]),""===c||c?(e=parseFloat(f),c===!0||isFinite(e)?e||0:f):f}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?Xa.test(n.css(a,"display"))&&0===a.offsetWidth?Pa(a,Za,function(){return fb(a,b,d)}):fb(a,b,d):void 0},set:function(a,c,d){var e=d&&Ra(a);return db(a,c,d?eb(a,b,d,l.boxSizing&&"border-box"===n.css(a,"boxSizing",!1,e),e):0)}}}),l.opacity||(n.cssHooks.opacity={get:function(a,b){return Wa.test((b&&a.currentStyle?a.currentStyle.filter:a.style.filter)||"")?.01*parseFloat(RegExp.$1)+"":b?"1":""},set:function(a,b){var c=a.style,d=a.currentStyle,e=n.isNumeric(b)?"alpha(opacity="+100*b+")":"",f=d&&d.filter||c.filter||"";c.zoom=1,(b>=1||""===b)&&""===n.trim(f.replace(Va,""))&&c.removeAttribute&&(c.removeAttribute("filter"),""===b||d&&!d.filter)||(c.filter=Va.test(f)?f.replace(Va,e):f+" "+e)}}),n.cssHooks.marginRight=Ua(l.reliableMarginRight,function(a,b){return b?Pa(a,{display:"inline-block"},Sa,[a,"marginRight"]):void 0}),n.cssHooks.marginLeft=Ua(l.reliableMarginLeft,function(a,b){return b?(parseFloat(Sa(a,"marginLeft"))||(n.contains(a.ownerDocument,a)?a.getBoundingClientRect().left-Pa(a,{
    marginLeft:0},function(){return a.getBoundingClientRect().left}):0))+"px":void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+V[d]+b]=f[d]||f[d-2]||f[0];return e}},Na.test(a)||(n.cssHooks[a+b].set=db)}),n.fn.extend({css:function(a,b){return Y(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=Ra(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return cb(this,!0)},hide:function(){return cb(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){W(this)?n(this).show():n(this).hide()})}});function gb(a,b,c,d,e){return new gb.prototype.init(a,b,c,d,e)}n.Tween=gb,gb.prototype={constructor:gb,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||n.easing._default,this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=gb.propHooks[this.prop];return a&&a.get?a.get(this):gb.propHooks._default.get(this)},run:function(a){var b,c=gb.propHooks[this.prop];return this.options.duration?this.pos=b=n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):this.pos=b=a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):gb.propHooks._default.set(this),this}},gb.prototype.init.prototype=gb.prototype,gb.propHooks={_default:{get:function(a){var b;return 1!==a.elem.nodeType||null!=a.elem[a.prop]&&null==a.elem.style[a.prop]?a.elem[a.prop]:(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0)},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):1!==a.elem.nodeType||null==a.elem.style[n.cssProps[a.prop]]&&!n.cssHooks[a.prop]?a.elem[a.prop]=a.now:n.style(a.elem,a.prop,a.now+a.unit)}}},gb.propHooks.scrollTop=gb.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2},_default:"swing"},n.fx=gb.prototype.init,n.fx.step={};var hb,ib,jb=/^(?:toggle|show|hide)$/,kb=/queueHooks$/;function lb(){return a.setTimeout(function(){hb=void 0}),hb=n.now()}function mb(a,b){var c,d={height:a},e=0;for(b=b?1:0;4>e;e+=2-b)c=V[e],d["margin"+c]=d["padding"+c]=a;return b&&(d.opacity=d.width=a),d}function nb(a,b,c){for(var d,e=(qb.tweeners[b]||[]).concat(qb.tweeners["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function ob(a,b,c){var d,e,f,g,h,i,j,k,m=this,o={},p=a.style,q=a.nodeType&&W(a),r=n._data(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,m.always(function(){m.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[p.overflow,p.overflowX,p.overflowY],j=n.css(a,"display"),k="none"===j?n._data(a,"olddisplay")||Ma(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(l.inlineBlockNeedsLayout&&"inline"!==Ma(a.nodeName)?p.zoom=1:p.display="inline-block")),c.overflow&&(p.overflow="hidden",l.shrinkWrapBlocks()||m.always(function(){p.overflow=c.overflow[0],p.overflowX=c.overflow[1],p.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],jb.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(q?"hide":"show")){if("show"!==e||!r||void 0===r[d])continue;q=!0}o[d]=r&&r[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(o))"inline"===("none"===j?Ma(a.nodeName):j)&&(p.display=j);else{r?"hidden"in r&&(q=r.hidden):r=n._data(a,"fxshow",{}),f&&(r.hidden=!q),q?n(a).show():m.done(function(){n(a).hide()}),m.done(function(){var b;n._removeData(a,"fxshow");for(b in o)n.style(a,b,o[b])});for(d in o)g=nb(q?r[d]:0,d,m),d in r||(r[d]=g.start,q&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function pb(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function qb(a,b,c){var d,e,f=0,g=qb.prefilters.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=hb||lb(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{},easing:n.easing._default},c),originalProperties:b,originalOptions:c,startTime:hb||lb(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?(h.notifyWith(a,[j,1,0]),h.resolveWith(a,[j,b])):h.rejectWith(a,[j,b]),this}}),k=j.props;for(pb(k,j.opts.specialEasing);g>f;f++)if(d=qb.prefilters[f].call(j,a,k,j.opts))return n.isFunction(d.stop)&&(n._queueHooks(j.elem,j.opts.queue).stop=n.proxy(d.stop,d)),d;return n.map(k,nb,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(qb,{tweeners:{"*":[function(a,b){var c=this.createTween(a,b);return X(c.elem,a,U.exec(b),c),c}]},tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.match(G);for(var c,d=0,e=a.length;e>d;d++)c=a[d],qb.tweeners[c]=qb.tweeners[c]||[],qb.tweeners[c].unshift(b)},prefilters:[ob],prefilter:function(a,b){b?qb.prefilters.unshift(a):qb.prefilters.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,null!=d.queue&&d.queue!==!0||(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(W).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=qb(this,n.extend({},a),f);(e||n._data(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=n._data(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&kb.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));!b&&c||n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=n._data(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(mb(b,!0),a,d,e)}}),n.each({slideDown:mb("show"),slideUp:mb("hide"),slideToggle:mb("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=n.timers,c=0;for(hb=n.now();c<b.length;c++)a=b[c],a()||b[c]!==a||b.splice(c--,1);b.length||n.fx.stop(),hb=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){ib||(ib=a.setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){a.clearInterval(ib),ib=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(b,c){return b=n.fx?n.fx.speeds[b]||b:b,c=c||"fx",this.queue(c,function(c,d){var e=a.setTimeout(c,b);d.stop=function(){a.clearTimeout(e)}})},function(){var a,b=d.createElement("input"),c=d.createElement("div"),e=d.createElement("select"),f=e.appendChild(d.createElement("option"));c=d.createElement("div"),c.setAttribute("className","t"),c.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",a=c.getElementsByTagName("a")[0],b.setAttribute("type","checkbox"),c.appendChild(b),a=c.getElementsByTagName("a")[0],a.style.cssText="top:1px",l.getSetAttribute="t"!==c.className,l.style=/top/.test(a.getAttribute("style")),l.hrefNormalized="/a"===a.getAttribute("href"),l.checkOn=!!b.value,l.optSelected=f.selected,l.enctype=!!d.createElement("form").enctype,e.disabled=!0,l.optDisabled=!f.disabled,b=d.createElement("input"),b.setAttribute("value",""),l.input=""===b.getAttribute("value"),b.value="t",b.setAttribute("type","radio"),l.radioValue="t"===b.value}();var rb=/\r/g,sb=/[\x20\t\r\n\f]+/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(rb,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a)).replace(sb," ")}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],(c.selected||i===e)&&(l.optDisabled?!c.disabled:null===c.getAttribute("disabled"))&&(!c.parentNode.disabled||!n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)if(d=e[g],n.inArray(n.valHooks.option.get(d),f)>-1)try{d.selected=c=!0}catch(h){d.scrollHeight}else d.selected=!1;return c||(a.selectedIndex=-1),e}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>-1:void 0}},l.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})});var tb,ub,vb=n.expr.attrHandle,wb=/^(?:checked|selected)$/i,xb=l.getSetAttribute,yb=l.input;n.fn.extend({attr:function(a,b){return Y(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(3!==f&&8!==f&&2!==f)return"undefined"==typeof a.getAttribute?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),e=n.attrHooks[b]||(n.expr.match.bool.test(b)?ub:tb)),void 0!==c?null===c?void n.removeAttr(a,b):e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:(a.setAttribute(b,c+""),c):e&&"get"in e&&null!==(d=e.get(a,b))?d:(d=n.find.attr(a,b),null==d?void 0:d))},attrHooks:{type:{set:function(a,b){if(!l.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(G);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)?yb&&xb||!wb.test(c)?a[d]=!1:a[n.camelCase("default-"+c)]=a[d]=!1:n.attr(a,c,""),a.removeAttribute(xb?c:d)}}),ub={set:function(a,b,c){return b===!1?n.removeAttr(a,c):yb&&xb||!wb.test(c)?a.setAttribute(!xb&&n.propFix[c]||c,c):a[n.camelCase("default-"+c)]=a[c]=!0,c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=vb[b]||n.find.attr;yb&&xb||!wb.test(b)?vb[b]=function(a,b,d){var e,f;return d||(f=vb[b],vb[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,vb[b]=f),e}:vb[b]=function(a,b,c){return c?void 0:a[n.camelCase("default-"+b)]?b.toLowerCase():null}}),yb&&xb||(n.attrHooks.value={set:function(a,b,c){return n.nodeName(a,"input")?void(a.defaultValue=b):tb&&tb.set(a,b,c)}}),xb||(tb={set:function(a,b,c){var d=a.getAttributeNode(c);return d||a.setAttributeNode(d=a.ownerDocument.createAttribute(c)),d.value=b+="","value"===c||b===a.getAttribute(c)?b:void 0}},vb.id=vb.name=vb.coords=function(a,b,c){var d;return c?void 0:(d=a.getAttributeNode(b))&&""!==d.value?d.value:null},n.valHooks.button={get:function(a,b){var c=a.getAttributeNode(b);return c&&c.specified?c.value:void 0},set:tb.set},n.attrHooks.contenteditable={set:function(a,b,c){tb.set(a,""===b?!1:b,c)}},n.each(["width","height"],function(a,b){n.attrHooks[b]={set:function(a,c){return""===c?(a.setAttribute(b,"auto"),c):void 0}}})),l.style||(n.attrHooks.style={get:function(a){return a.style.cssText||void 0},set:function(a,b){return a.style.cssText=b+""}});var zb=/^(?:input|select|textarea|button|object)$/i,Ab=/^(?:a|area)$/i;n.fn.extend({prop:function(a,b){return Y(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return a=n.propFix[a]||a,this.each(function(){try{this[a]=void 0,delete this[a]}catch(b){}})}}),n.extend({prop:function(a,b,c){var d,e,f=a.nodeType;if(3!==f&&8!==f&&2!==f)return 1===f&&n.isXMLDoc(a)||(b=n.propFix[b]||b,e=n.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){var b=n.find.attr(a,"tabindex");return b?parseInt(b,10):zb.test(a.nodeName)||Ab.test(a.nodeName)&&a.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),l.hrefNormalized||n.each(["href","src"],function(a,b){n.propHooks[b]={get:function(a){return a.getAttribute(b,4)}}}),l.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex),null},set:function(a){var b=a.parentNode;b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex)}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this}),l.enctype||(n.propFix.enctype="encoding");var Bb=/[\t\r\n\f]/g;function Cb(a){return n.attr(a,"class")||""}n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h,i=0;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,Cb(this)))});if("string"==typeof a&&a){b=a.match(G)||[];while(c=this[i++])if(e=Cb(c),d=1===c.nodeType&&(" "+e+" ").replace(Bb," ")){g=0;while(f=b[g++])d.indexOf(" "+f+" ")<0&&(d+=f+" ");h=n.trim(d),e!==h&&n.attr(c,"class",h)}}return this},removeClass:function(a){var b,c,d,e,f,g,h,i=0;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,Cb(this)))});if(!arguments.length)return this.attr("class","");if("string"==typeof a&&a){b=a.match(G)||[];while(c=this[i++])if(e=Cb(c),d=1===c.nodeType&&(" "+e+" ").replace(Bb," ")){g=0;while(f=b[g++])while(d.indexOf(" "+f+" ")>-1)d=d.replace(" "+f+" "," ");h=n.trim(d),e!==h&&n.attr(c,"class",h)}}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):n.isFunction(a)?this.each(function(c){n(this).toggleClass(a.call(this,c,Cb(this),b),b)}):this.each(function(){var b,d,e,f;if("string"===c){d=0,e=n(this),f=a.match(G)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else void 0!==a&&"boolean"!==c||(b=Cb(this),b&&n._data(this,"__className__",b),n.attr(this,"class",b||a===!1?"":n._data(this,"__className__")||""))})},hasClass:function(a){var b,c,d=0;b=" "+a+" ";while(c=this[d++])if(1===c.nodeType&&(" "+Cb(c)+" ").replace(Bb," ").indexOf(b)>-1)return!0;return!1}}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)}});var Db=a.location,Eb=n.now(),Fb=/\?/,Gb=/(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g;n.parseJSON=function(b){if(a.JSON&&a.JSON.parse)return a.JSON.parse(b+"");var c,d=null,e=n.trim(b+"");return e&&!n.trim(e.replace(Gb,function(a,b,e,f){return c&&b&&(d=0),0===d?a:(c=e||b,d+=!f-!e,"")}))?Function("return "+e)():n.error("Invalid JSON: "+b)},n.parseXML=function(b){var c,d;if(!b||"string"!=typeof b)return null;try{a.DOMParser?(d=new a.DOMParser,c=d.parseFromString(b,"text/xml")):(c=new a.ActiveXObject("Microsoft.XMLDOM"),c.async="false",c.loadXML(b))}catch(e){c=void 0}return c&&c.documentElement&&!c.getElementsByTagName("parsererror").length||n.error("Invalid XML: "+b),c};var Hb=/#.*$/,Ib=/([?&])_=[^&]*/,Jb=/^(.*?):[ \t]*([^\r\n]*)\r?$/gm,Kb=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,Lb=/^(?:GET|HEAD)$/,Mb=/^\/\//,Nb=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,Ob={},Pb={},Qb="*/".concat("*"),Rb=Db.href,Sb=Nb.exec(Rb.toLowerCase())||[];function Tb(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(G)||[];if(n.isFunction(c))while(d=f[e++])"+"===d.charAt(0)?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function Ub(a,b,c,d){var e={},f=a===Pb;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function Vb(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(d in b)void 0!==b[d]&&((e[d]?a:c||(c={}))[d]=b[d]);return c&&n.extend(!0,a,c),a}function Wb(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===e&&(e=a.mimeType||b.getResponseHeader("Content-Type"));if(e)for(g in h)if(h[g]&&h[g].test(e)){i.unshift(g);break}if(i[0]in c)f=i[0];else{for(g in c){if(!i[0]||a.converters[g+" "+i[0]]){f=g;break}d||(d=g)}f=f||d}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function Xb(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Rb,type:"GET",isLocal:Kb.test(Sb[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":Qb,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?Vb(Vb(a,n.ajaxSettings),b):Vb(n.ajaxSettings,a)},ajaxPrefilter:Tb(Ob),ajaxTransport:Tb(Pb),ajax:function(b,c){"object"==typeof b&&(c=b,b=void 0),c=c||{};var d,e,f,g,h,i,j,k,l=n.ajaxSetup({},c),m=l.context||l,o=l.context&&(m.nodeType||m.jquery)?n(m):n.event,p=n.Deferred(),q=n.Callbacks("once memory"),r=l.statusCode||{},s={},t={},u=0,v="canceled",w={readyState:0,getResponseHeader:function(a){var b;if(2===u){if(!k){k={};while(b=Jb.exec(g))k[b[1].toLowerCase()]=b[2]}b=k[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===u?g:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return u||(a=t[c]=t[c]||a,s[a]=b),this},overrideMimeType:function(a){return u||(l.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>u)for(b in a)r[b]=[r[b],a[b]];else w.always(a[w.status]);return this},abort:function(a){var b=a||v;return j&&j.abort(b),y(0,b),this}};if(p.promise(w).complete=q.add,w.success=w.done,w.error=w.fail,l.url=((b||l.url||Rb)+"").replace(Hb,"").replace(Mb,Sb[1]+"//"),l.type=c.method||c.type||l.method||l.type,l.dataTypes=n.trim(l.dataType||"*").toLowerCase().match(G)||[""],null==l.crossDomain&&(d=Nb.exec(l.url.toLowerCase()),l.crossDomain=!(!d||d[1]===Sb[1]&&d[2]===Sb[2]&&(d[3]||("http:"===d[1]?"80":"443"))===(Sb[3]||("http:"===Sb[1]?"80":"443")))),l.data&&l.processData&&"string"!=typeof l.data&&(l.data=n.param(l.data,l.traditional)),Ub(Ob,l,c,w),2===u)return w;i=n.event&&l.global,i&&0===n.active++&&n.event.trigger("ajaxStart"),l.type=l.type.toUpperCase(),l.hasContent=!Lb.test(l.type),f=l.url,l.hasContent||(l.data&&(f=l.url+=(Fb.test(f)?"&":"?")+l.data,delete l.data),l.cache===!1&&(l.url=Ib.test(f)?f.replace(Ib,"$1_="+Eb++):f+(Fb.test(f)?"&":"?")+"_="+Eb++)),l.ifModified&&(n.lastModified[f]&&w.setRequestHeader("If-Modified-Since",n.lastModified[f]),n.etag[f]&&w.setRequestHeader("If-None-Match",n.etag[f])),(l.data&&l.hasContent&&l.contentType!==!1||c.contentType)&&w.setRequestHeader("Content-Type",l.contentType),w.setRequestHeader("Accept",l.dataTypes[0]&&l.accepts[l.dataTypes[0]]?l.accepts[l.dataTypes[0]]+("*"!==l.dataTypes[0]?", "+Qb+"; q=0.01":""):l.accepts["*"]);for(e in l.headers)w.setRequestHeader(e,l.headers[e]);if(l.beforeSend&&(l.beforeSend.call(m,w,l)===!1||2===u))return w.abort();v="abort";for(e in{success:1,error:1,complete:1})w[e](l[e]);if(j=Ub(Pb,l,c,w)){if(w.readyState=1,i&&o.trigger("ajaxSend",[w,l]),2===u)return w;l.async&&l.timeout>0&&(h=a.setTimeout(function(){w.abort("timeout")},l.timeout));try{u=1,j.send(s,y)}catch(x){if(!(2>u))throw x;y(-1,x)}}else y(-1,"No Transport");function y(b,c,d,e){var k,s,t,v,x,y=c;2!==u&&(u=2,h&&a.clearTimeout(h),j=void 0,g=e||"",w.readyState=b>0?4:0,k=b>=200&&300>b||304===b,d&&(v=Wb(l,w,d)),v=Xb(l,v,w,k),k?(l.ifModified&&(x=w.getResponseHeader("Last-Modified"),x&&(n.lastModified[f]=x),x=w.getResponseHeader("etag"),x&&(n.etag[f]=x)),204===b||"HEAD"===l.type?y="nocontent":304===b?y="notmodified":(y=v.state,s=v.data,t=v.error,k=!t)):(t=y,!b&&y||(y="error",0>b&&(b=0))),w.status=b,w.statusText=(c||y)+"",k?p.resolveWith(m,[s,y,w]):p.rejectWith(m,[w,y,t]),w.statusCode(r),r=void 0,i&&o.trigger(k?"ajaxSuccess":"ajaxError",[w,l,k?s:t]),q.fireWith(m,[w,y]),i&&(o.trigger("ajaxComplete",[w,l]),--n.active||n.event.trigger("ajaxStop")))}return w},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax(n.extend({url:a,type:b,dataType:e,data:c,success:d},n.isPlainObject(a)&&a))}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){if(n.isFunction(a))return this.each(function(b){n(this).wrapAll(a.call(this,b))});if(this[0]){var b=n(a,this[0].ownerDocument).eq(0).clone(!0);this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstChild&&1===a.firstChild.nodeType)a=a.firstChild;return a}).append(this)}return this},wrapInner:function(a){return n.isFunction(a)?this.each(function(b){n(this).wrapInner(a.call(this,b))}):this.each(function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}});function Yb(a){return a.style&&a.style.display||n.css(a,"display")}function Zb(a){if(!n.contains(a.ownerDocument||d,a))return!0;while(a&&1===a.nodeType){if("none"===Yb(a)||"hidden"===a.type)return!0;a=a.parentNode}return!1}n.expr.filters.hidden=function(a){return l.reliableHiddenOffsets()?a.offsetWidth<=0&&a.offsetHeight<=0&&!a.getClientRects().length:Zb(a)},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)};var $b=/%20/g,_b=/\[\]$/,ac=/\r?\n/g,bc=/^(?:submit|button|image|reset|file)$/i,cc=/^(?:input|select|textarea|keygen)/i;function dc(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||_b.test(a)?d(a,e):dc(a+"["+("object"==typeof e&&null!=e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)dc(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)dc(c,a[c],b,e);return d.join("&").replace($b,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&cc.test(this.nodeName)&&!bc.test(a)&&(this.checked||!Z.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(ac,"\r\n")}}):{name:b.name,value:c.replace(ac,"\r\n")}}).get()}}),n.ajaxSettings.xhr=void 0!==a.ActiveXObject?function(){return this.isLocal?ic():d.documentMode>8?hc():/^(get|post|head|put|delete|options)$/i.test(this.type)&&hc()||ic()}:hc;var ec=0,fc={},gc=n.ajaxSettings.xhr();a.attachEvent&&a.attachEvent("onunload",function(){for(var a in fc)fc[a](void 0,!0)}),l.cors=!!gc&&"withCredentials"in gc,gc=l.ajax=!!gc,gc&&n.ajaxTransport(function(b){if(!b.crossDomain||l.cors){var c;return{send:function(d,e){var f,g=b.xhr(),h=++ec;if(g.open(b.type,b.url,b.async,b.username,b.password),b.xhrFields)for(f in b.xhrFields)g[f]=b.xhrFields[f];b.mimeType&&g.overrideMimeType&&g.overrideMimeType(b.mimeType),b.crossDomain||d["X-Requested-With"]||(d["X-Requested-With"]="XMLHttpRequest");for(f in d)void 0!==d[f]&&g.setRequestHeader(f,d[f]+"");g.send(b.hasContent&&b.data||null),c=function(a,d){var f,i,j;if(c&&(d||4===g.readyState))if(delete fc[h],c=void 0,g.onreadystatechange=n.noop,d)4!==g.readyState&&g.abort();else{j={},f=g.status,"string"==typeof g.responseText&&(j.text=g.responseText);try{i=g.statusText}catch(k){i=""}f||!b.isLocal||b.crossDomain?1223===f&&(f=204):f=j.text?200:404}j&&e(f,i,j,g.getAllResponseHeaders())},b.async?4===g.readyState?a.setTimeout(c):g.onreadystatechange=fc[h]=c:c()},abort:function(){c&&c(void 0,!0)}}}});function hc(){try{return new a.XMLHttpRequest}catch(b){}}function ic(){try{return new a.ActiveXObject("Microsoft.XMLHTTP")}catch(b){}}n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET",a.global=!1)}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c=d.head||n("head")[0]||d.documentElement;return{send:function(e,f){b=d.createElement("script"),b.async=!0,a.scriptCharset&&(b.charset=a.scriptCharset),b.src=a.url,b.onload=b.onreadystatechange=function(a,c){(c||!b.readyState||/loaded|complete/.test(b.readyState))&&(b.onload=b.onreadystatechange=null,b.parentNode&&b.parentNode.removeChild(b),b=null,c||f(200,"success"))},c.insertBefore(b,c.firstChild)},abort:function(){b&&b.onload(void 0,!0)}}}});var jc=[],kc=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=jc.pop()||n.expando+"_"+Eb++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(kc.test(b.url)?"url":"string"==typeof b.data&&0===(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&kc.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(kc,"$1"+e):b.jsonp!==!1&&(b.url+=(Fb.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){void 0===f?n(a).removeProp(e):a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,jc.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||d;var e=x.exec(a),f=!c&&[];return e?[b.createElement(e[1])]:(e=ja([a],b,f),f&&f.length&&n(f).remove(),n.merge([],e.childNodes))};var lc=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&lc)return lc.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>-1&&(d=n.trim(a.slice(h,a.length)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e||"GET",dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).always(c&&function(a,b){g.each(function(){c.apply(this,f||[a.responseText,b,a])})}),this},n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};function mc(a){return n.isWindow(a)?a:9===a.nodeType?a.defaultView||a.parentWindow:!1}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&n.inArray("auto",[f,i])>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,n.extend({},h))),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d={top:0,left:0},e=this[0],f=e&&e.ownerDocument;if(f)return b=f.documentElement,n.contains(b,e)?("undefined"!=typeof e.getBoundingClientRect&&(d=e.getBoundingClientRect()),c=mc(f),{top:d.top+(c.pageYOffset||b.scrollTop)-(b.clientTop||0),left:d.left+(c.pageXOffset||b.scrollLeft)-(b.clientLeft||0)}):d},position:function(){if(this[0]){var a,b,c={top:0,left:0},d=this[0];return"fixed"===n.css(d,"position")?b=d.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(c=a.offset()),c.top+=n.css(a[0],"borderTopWidth",!0),c.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-c.top-n.css(d,"marginTop",!0),left:b.left-c.left-n.css(d,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent;while(a&&!n.nodeName(a,"html")&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Qa})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,b){var c=/Y/.test(b);n.fn[a]=function(d){return Y(this,function(a,d,e){var f=mc(a);return void 0===e?f?b in f?f[b]:f.document.documentElement[d]:a[d]:void(f?f.scrollTo(c?n(f).scrollLeft():e,c?e:n(f).scrollTop()):a[d]=e)},a,d,arguments.length,null)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=Ua(l.pixelPosition,function(a,c){return c?(c=Sa(a,b),Oa.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({
    padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return Y(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.extend({bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}}),n.fn.size=function(){return this.length},n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var nc=a.jQuery,oc=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=oc),b&&a.jQuery===n&&(a.jQuery=nc),n},b||(a.jQuery=a.$=n),n});
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('jqueryPlugins',["jquery"], function ($) {
      // This isn't really a "module" since it just patches jQuery itself
    
      // FIX ME Animations TO DO
      // walkthrough animations go here
      // animate participant cursor and box popping in when they enter the session
      // animate participant cursor and box popping out when they leave the session
      // animate the participant cursor -> rotate down when they're down the page
      $.fn.rotateCursorDown = function () {
        $('svg').animate({borderSpacing: -150, opacity: 1}, {
          step: function(now, fx) {
            if (fx.prop == "borderSpacing") {
              $(this).css('-webkit-transform', 'rotate('+now+'deg)')
                .css('-moz-transform', 'rotate('+now+'deg)')
                .css('-ms-transform', 'rotate('+now+'deg)')
                .css('-o-transform', 'rotate('+now+'deg)')
                .css('transform', 'rotate('+now+'deg)');
            } else {
              $(this).css(fx.prop, now);
            }
          },
          duration: 500
        }, 'linear').promise().then(function () {
          this.css('-webkit-transform', '');
          this.css('-moz-transform', '');
          this.css('-ms-transform', '');
          this.css('-o-transform', '');
          this.css('transform', '');
          this.css("opacity", "");
        });
      };
    
      // animate the participant cursor -> rotate up when they're on the same frame as the user
      $.fn.rotateCursorDown = function () {
        $('.togetherjs-cursor svg').animate({borderSpacing: 0, opacity: 1}, {
          step: function(now, fx) {
            if (fx.prop == "borderSpacing") {
              $(this).css('-webkit-transform', 'rotate('+now+'deg)')
                .css('-moz-transform', 'rotate('+now+'deg)')
                .css('-ms-transform', 'rotate('+now+'deg)')
                .css('-o-transform', 'rotate('+now+'deg)')
                .css('transform', 'rotate('+now+'deg)');
            } else {
              $(this).css(fx.prop, now);
            }
          },
          duration: 500
        }, 'linear').promise().then(function () {
          this.css('-webkit-transform', '');
          this.css('-moz-transform', '');
          this.css('-ms-transform', '');
          this.css('-o-transform', '');
          this.css('transform', '');
          this.css("opacity", "");
        });
      };
    
      // Move notification when another notification slides in //
    
    
      /* Pop in window from dock button: */
      $.fn.popinWindow = function () {
    
        //mobile popout window with no animation
        if($.browser.mobile) {
    
           //starting position
            this.css({
              left: "0px",
              opacity: 1,
              "zIndex": 8888
            });
    
            //starting position for arrow
            $('#togetherjs-window-pointer').css({
              left: "+=74px",
              opacity: 1,
              "zIndex": 8888
            });
    
            //animate arrow out
            $('#togetherjs-window-pointer').animate({
              opacity: 1,
              left: "-=78px"
            }, {
              duration:60, easing:"linear"
            });
            $('#togetherjs-window-pointer').queue();
    
            //bounce arrow back
            $('#togetherjs-window-pointer').animate({
              left:'+=4px'
            }, {
              duration:60, easing:"linear"
            });
    
            //animate window out
            this.animate({
              opacity: 1,
              left: "0px"
            }, {
              duration:60, easing:"linear"
            });
            this.queue();
    
            //bounce window back
            this.animate({
              left:'0px'
            }, {
              duration:60, easing:"linear"
            });
        }
    
        else {
          const ifacePos = require("ui").panelPosition()
          const isRight = (ifacePos == "right")
          const pointer = $('#togetherjs-window-pointer')
      
          if (isRight || (ifacePos == "left")) {
            //starting position
            this.css({
              left: isRight ? "+=74px" : "-=74px",
              opacity: 1,
              "zIndex": 8888
            });
    
            //starting position for arrow
            pointer.css({
              left: isRight ? "+=74px" : "-=74px",
              opacity: 1,
              "zIndex": 8888
            });
    
            //animate arrow out
            pointer.animate({
              opacity: 1,
              left: isRight ? "-=78px" : "+=78px"
            }, {
              duration: 60, easing: "linear"
            });
            pointer.queue();
    
            //bounce arrow back
            pointer.animate({
              left: isRight ? '+=4px' : '-=4px'
            }, {
              duration: 60, easing: "linear"
            });
    
            //animate window out
            this.animate({
              opacity: 1,
              left: isRight ? "-=78px" : "+=78px"
            }, {
              duration: 60, easing: "linear"
            });
            this.queue();
    
            //bounce window back
            this.animate({
              left: isRight ? '+=4px' : '-=4px'
            }, {
              duration: 60, easing: "linear"
            });
          } else {
            const isBottom = (ifacePos == "bottom")
            //starting position
            this.css({
              top: isBottom ? "+=74px" : "-=74px",
              opacity: 1,
              "zIndex": 8888
            });
    
            //starting position for arrow
            pointer.css({
              top: isBottom ? "+=74px" : "-=74px",
              opacity: 1,
              "zIndex": 8888
            });
    
            //animate arrow out
            pointer.animate({
              opacity: 1,
              top: isBottom ? "-=78px" : "+=78px"
            }, {
              duration: 60, easing: "linear"
            });
            pointer.queue();
    
            //bounce arrow back
            pointer.animate({
              top: isBottom ? '+=4px' : '-=4px'
            }, {
              duration: 60, easing: "linear"
            });
    
            //animate window out
            this.animate({
              opacity: 1,
              top: isBottom ? "-=78px" : "+=78px"
            }, {
              duration: 60, easing: "linear"
            });
            this.queue();
    
            //bounce window back
            this.animate({
              top: isBottom ? '+=4px' : '-=4px'
            }, {
              duration: 60, easing: "linear"
            });
          }
        }
    
      };
    
      /* Slide in notification window: */
      $.fn.slideIn = function () {
        this.css({
          //top: "240px",
          left: "+=74px",
          opacity: 0,
          "zIndex": 8888
        });
        return this.animate({
          "left": "-=74px",
          opacity: 1,
          "zIndex": 9999
        }, "fast");
      };
    
      /* Used to fade away notification windows + flip the bottom of them out: */
      $.fn.fadeOut = function () {
        this.animate({borderSpacing: -90, opacity: 0.5}, {
          step: function(now, fx) {
            if (fx.prop == "borderSpacing") {
              $(this).css('-webkit-transform', 'perspective( 600px ) rotateX('+now+'deg)')
                .css('-moz-transform', 'perspective( 600px ) rotateX('+now+'deg)')
                .css('-ms-transform', 'perspective( 600px ) rotateX('+now+'deg)')
                .css('-o-transform', 'perspective( 600px ) rotateX('+now+'deg)')
                .css('transform', 'perspective( 600px ) rotateX('+now+'deg)');
            } else {
              $(this).css(fx.prop, now);
            }
          },
          duration: 500
        }, 'linear').promise().then(function () {
          this.css('-webkit-transform', '');
          this.css('-moz-transform', '');
          this.css('-ms-transform', '');
          this.css('-o-transform', '');
          this.css('transform', '');
          this.css("opacity", "");
        });
        return this;
      };
    
      /* used when user goes down to participant cursor location on screen */
      $.fn.easeTo = function (y) {
        return this.animate({
          scrollTop: y
        }, {
          duration: 400,
          easing: "swing"
        });
      };
    
      // avatar animate in
      $.fn.animateDockEntry = function () {
        var height = this.height();
        var width = this.width();
        var backgroundSize = height + 4;
        var margin = parseInt(this.css("marginLeft"), 10);
    
        // set starting position CSS for avatar
        this.css({
          marginLeft: margin + width/2,
          height: 0,
          width: 0,
          backgroundSize: "0 0"
        });
    
        var self = this;
    
        //then animate avatar to the actual dimensions, and reset the values
        this.animate({
          marginLeft: margin,
          height: height,
          width: width,
          backgroundSize: backgroundSize
        }, {
          duration: 600
        }).promise().then(function () {
          self.css({
            marginLeft: "",
            height: "",
            width: "",
            backgroundSize: ""
          });
        });
        return this;
      };
    
      // avatar animate out, reverse of above
      $.fn.animateDockExit = function () {
    
        // get the current avatar dimenensions
        var height = this.height();
        var width = this.width();
        var backgroundSize = height + 4;
        var margin = parseInt(this.css("marginLeft"), 10);
    
        //then animate avatar to shrink to nothing, and reset the values again
        // FIXME this needs to animate from the CENTER
        this.animate({
          marginLeft: margin + width/2,
          height: 0,
          width: 0,
          backgroundSize: "0 0",
          opacity: 0
        }, 600 );
    
        return this;
    
      };
    
      $.fn.animateCursorEntry = function () {
        // Make the cursor bubble pop in
      };
    
      // keyboard typing animation
      $.fn.animateKeyboard = function () {
        var one = this.find(".togetherjs-typing-ellipse-one");
        var two = this.find(".togetherjs-typing-ellipse-two");
        var three = this.find(".togetherjs-typing-ellipse-three");
        var count = -1;
        var run = (function () {
          count = (count+1) % 4;
          if (count === 0) {
            one.css("opacity", 0.5);
            two.css("opacity", 0.5);
            three.css("opacity", 0.5);
          } else if (count == 1) {
            one.css("opacity", 1);
          } else if (count == 2) {
            two.css("opacity", 1);
          } else { // count==3
            three.css("opacity", 1);
          }
        }).bind(this);
        run();
        var interval = setInterval(run, 300);
        this.data("animateKeyboard", interval);
      };
    
      $.fn.stopKeyboardAnimation = function () {
        clearTimeout(this.data("animateKeyboard"));
        this.data("animateKeyboard", null);
      };
    
      // FIXME: not sure if this is legit, but at least the modern mobile devices we
      // care about should have this defined:
      if (! $.browser) {
        $.browser = {};
      }
      $.browser.mobile = window.orientation !== undefined;
      if (navigator.userAgent.search(/mobile/i) != -1) {
        // FIXME: At least on the Firefox OS simulator I need this
        $.browser.mobile = true;
      }
    
      if ($.browser.mobile && window.matchMedia && ! window.matchMedia("screen and (max-screen-width: 480px)").matches) {
        // FIXME: for Firefox OS simulator really:
        document.body.className += " togetherjs-mobile-browser";
      }
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('util',["jquery", "jqueryPlugins"], function ($) {
      var util = {};
    
      util.Deferred = $.Deferred;
      TogetherJS.$ = $;
    
      /* A simple class pattern, use like:
    
        var Foo = util.Class({
          constructor: function (a, b) {
            init the class
          },
          otherMethod: ...
        });
    
      You can also give a superclass as the optional first argument.
    
      Instantiation does not require "new"
    
      */
      util.Class = function (superClass, prototype) {
        var a;
        if (prototype === undefined) {
          prototype = superClass;
        } else {
          if (superClass.prototype) {
            superClass = superClass.prototype;
          }
          var newPrototype = Object.create(superClass);
          for (a in prototype) {
            if (prototype.hasOwnProperty(a)) {
              newPrototype[a] = prototype[a];
            }
          }
          prototype = newPrototype;
        }
        var ClassObject = function () {
          var obj = Object.create(prototype);
          obj.constructor.apply(obj, arguments);
          obj.constructor = ClassObject;
          return obj;
        };
        ClassObject.prototype = prototype;
        if (prototype.constructor.name) {
          ClassObject.className = prototype.constructor.name;
          ClassObject.toString = function () {
            return '[Class ' + this.className + ']';
          };
        }
        if (prototype.classMethods) {
          for (a in prototype.classMethods) {
            if (prototype.classMethods.hasOwnProperty(a)) {
              ClassObject[a] = prototype.classMethods[a];
            }
          }
        }
        return ClassObject;
      };
    
      /* Extends obj with other, or copies obj if no other is given. */
      util.extend = TogetherJS._extend;
    
      util.forEachAttr = function (obj, callback, context) {
        context = context || obj;
        for (var a in obj) {
          if (obj.hasOwnProperty(a)) {
            callback.call(context, obj[a], a);
          }
        }
      };
    
      /* Trim whitespace from a string */
      util.trim = function trim(s) {
        return s.replace(/^\s+/, "").replace(/\s+$/, "");
      };
    
      /* Convert a string into something safe to use as an HTML class name */
      util.safeClassName = function safeClassName(name) {
        return name.replace(/[^a-zA-Z0-9_\-]/g, "_") || "class";
      };
    
      util.AssertionError = function (message) {
        if (! this instanceof util.AssertionError) {
          return new util.AssertionError(message);
        }
        this.message = message;
        this.name = "AssertionError";
      };
      util.AssertionError.prototype = Error.prototype;
    
      util.assert = function (cond) {
        if (! cond) {
          var args = ["Assertion error:"].concat(Array.prototype.slice.call(arguments, 1));
          console.error.apply(console, args);
          if (console.trace) {
            console.trace();
          }
          throw new util.AssertionError(args.join(" "));
        }
      };
    
      /* Generates a random ID */
      util.generateId = function (length) {
        length = length || 10;
        var letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV0123456789';
        var s = '';
        for (var i=0; i<length; i++) {
          s += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        return s;
      };
    
      util.pickRandom = function (array) {
        return array[Math.floor(Math.random() * array.length)];
      };
    
      util.mixinEvents = TogetherJS._mixinEvents;
    
      util.Module = util.Class({
        constructor: function (name) {
          this._name = name;
        },
        toString: function () {
          return '[Module ' + this._name + ']';
        }
      });
    
      util.blobToBase64 = function (blob) {
        // Oh this is just terrible
        var binary = '';
        var bytes = new Uint8Array(blob);
        var len = bytes.byteLength;
        for (var i=0; i<len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };
    
      util.truncateCommonDomain = function (url, base) {
        /* Remove the scheme and domain from url, if it matches the scheme and domain
           of base */
        if (! base) {
          return url;
        }
        var regex = /^https?:\/\/[^\/]*/i;
        var match = regex.exec(url);
        var matchBase = regex.exec(base);
        if (match && matchBase && match[0] == matchBase[0]) {
          // There is a common scheme and domain
          return url.substr(match[0].length);
        }
        return url;
      };
    
      util.makeUrlAbsolute = function (url, base) {
        if (url.search(/^(http|https|ws|wss):/i) === 0) {
          // Absolute URL
          return url;
        }
        if (url.search(/^\/\/[^\/]/) === 0) {
          var scheme = (/^(http|https|ws|wss):/i).exec(base);
          util.assert(scheme, "No scheme on base URL", base);
          return scheme[1] + ":" + url;
        }
        if (url.search(/^\//) === 0) {
          var domain = (/^(http|https|ws|wss):\/\/[^\/]+/i).exec(base);
          util.assert(domain, "No scheme/domain on base URL", base);
          return domain[0] + url;
        }
        var last = (/[^\/]+$/).exec(base);
        util.assert(last, "Does not appear to be a URL?", base);
        var lastBase = base.substr(0, last.index);
        return lastBase + url;
      };
    
      util.assertValidUrl = function (url) {
        /* This does some simple assertions that the url is valid:
           - it must be a string
           - it must be http(s)://... or data:...
           - it must not contain a space, quotation, or close paren
        */
        util.assert(typeof url == "string", "URLs must be a string:", url);
        util.assert(url.search(/^(http:\/\/|https:\/\/|\/\/|data:)/i) === 0,
                    "URL must have an http, https, data, or // scheme:", url);
        util.assert(url.search(/[\)\'\"\ ]/) === -1,
                    "URLs cannot contain ), ', \", or spaces:", JSON.stringify(url));
      };
    
      util.resolver = function (deferred, func) {
        util.assert(deferred.then, "Bad deferred:", deferred);
        util.assert(typeof func == "function", "Not a function:", func);
        return function () {
          var result;
          try {
            result = func.apply(this, arguments);
          } catch (e) {
            deferred.reject(e);
            throw e;
          }
          if (result && result.then) {
            result.then(function () {
              deferred.resolveWith(this, arguments);
            }, function () {
              deferred.rejectWith(this, arguments);
            });
            // FIXME: doesn't pass progress through
          } else if (result === undefined) {
            deferred.resolve();
          } else {
            deferred.resolve(result);
          }
          return result;
        };
      };
    
      /* Detects if a value is a promise.  Right now the presence of a
         `.then()` method is the best we can do.
      */
      util.isPromise = function (obj) {
        return typeof obj == "object" && obj.then;
      };
    
      /* Makes a value into a promise, by returning an already-resolved
         promise if a non-promise objectx is given.
      */
      util.makePromise = function (obj) {
        if (util.isPromise(obj)) {
          return obj;
        } else {
          return $.Deferred(function (def) {
            def.resolve(obj);
          });
        }
      };
    
      /* Resolves several promises (the promises are the arguments to the function)
         or the first argument may be an array of promises.
    
         Returns a promise that will resolve with the results of all the
         promises.  If any promise fails then the returned promise fails.
    
         FIXME: if a promise has more than one return value (like with
         promise.resolve(a, b)) then the latter arguments will be lost.
         */
      util.resolveMany = function () {
        var args;
        var oneArg = false;
        if (arguments.length == 1 && Array.isArray(arguments[0])) {
          oneArg = true;
          args = arguments[0];
        } else {
          args = Array.prototype.slice.call(arguments);
        }
        return util.Deferred(function (def) {
          var count = args.length;
          if (! count) {
            def.resolve();
            return;
          }
          var allResults = [];
          var anyError = false;
          args.forEach(function (arg, index) {
            arg.then(function (result) {
              allResults[index] = result;
              count--;
              check();
            }, function (error) {
              allResults[index] = error;
              anyError = true;
              count--;
              check();
            });
          });
          function check() {
            if (! count) {
              if (anyError) {
                if (oneArg) {
                  def.reject(allResults);
                } else {
                  def.reject.apply(def, allResults);
                }
              } else {
                if (oneArg) {
                  def.resolve(allResults);
                } else {
                  def.resolve.apply(def, allResults);
                }
              }
            }
          }
        });
      };
    
      util.readFileImage = function (el) {
        return util.Deferred(function (def) {
          var reader = new FileReader();
          reader.onload = function () {
            def.resolve("data:image/jpeg;base64," + util.blobToBase64(this.result));
          };
          reader.onerror = function () {
            def.reject(this.error);
          };
          reader.readAsArrayBuffer(el.files[0]);
        });
      };
    
      util.matchElement = function(el, selector) {
        var res = selector;
        if (selector === true || ! selector) {
          return !!selector;
        }
        try {
          return $(el).is(selector);
        } catch (e) {
          console.warn("Bad selector:", selector, "error:", e);
          return false;
        }
    
      };
    
      util.testExpose = function (objs) {
        if (typeof TogetherJSTestSpy == "undefined") {
          return;
        }
        util.forEachAttr(objs, function (value, attr) {
          TogetherJSTestSpy[attr] = value;
        });
      };
    
      return util;
    });
    
    define('analytics',["util"], function (util) {
      var analytics = util.Module("analytics");
    
      analytics.activate = function () {
        var enable = TogetherJS.config.get("enableAnalytics");
        var code = TogetherJS.config.get("analyticsCode");
        TogetherJS.config.close("enableAnalytics");
        TogetherJS.config.close("analyticsCode");
        if (! (enable && code)) {
          return;
        }
        // This is intended to be global:
        var gaq = window._gaq || [];
        gaq.push(["_setAccount", code]);
        gaq.push(['_setDomainName', location.hostname]);
        gaq.push(["_trackPageview"]);
        window._gaq = gaq;
    
        (function() {
          var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
          ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
          var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
        })();
      };
    
      return analytics;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    /* Channel abstraction.  Supported channels:
    
    - WebSocket to an address
    - postMessage between windows
    
    In the future:
    
    - XMLHttpRequest to a server (with some form of queuing)
    
    The interface:
    
      channel = new ChannelName(parameters)
    
    The instantiation is specific to the kind of channel
    
    Methods:
    
      onmessage: set to function (jsonData)
      rawdata: set to true if you want onmessage to receive raw string data
      onclose: set to function ()
      send: function (string or jsonData)
      close: function ()
    
    .send() will encode the data if it is not a string.
    
    (should I include readyState as an attribute?)
    
    Channels must accept messages immediately, caching if the connection
    is not fully established yet.
    
    */
    
    define('channels',["util"], function (util) {
    
    var channels = util.Module("channels");
    /* Subclasses must define:
    
    - ._send(string)
    - ._setupConnection()
    - ._ready()
    - .close() (and must set this.closed to true)
    
    And must call:
    
    - ._flush() on open
    - ._incoming(string) on incoming message
    - onclose() (not onmessage - instead _incoming)
    - emit("close")
    */
    
    var AbstractChannel = util.mixinEvents({
      onmessage: null,
      rawdata: false,
      onclose: null,
      closed: false,
    
      baseConstructor: function () {
        this._buffer = [];
        this._setupConnection();
      },
    
      send: function (data) {
        if (this.closed) {
          throw 'Cannot send to a closed connection';
        }
        if (typeof data != "string") {
          data = JSON.stringify(data);
        }
        if (! this._ready()) {
          this._buffer.push(data);
          return;
        }
        this._send(data);
      },
    
      _flush: function () {
        for (var i=0; i<this._buffer.length; i++) {
          this._send(this._buffer[i]);
        }
        this._buffer = [];
      },
    
      _incoming: function (data) {
        if (! this.rawdata) {
          try {
            data = JSON.parse(data);
          } catch (e) {
            console.error("Got invalid JSON data:", data.substr(0, 40));
            throw e;
          }
        }
        if (this.onmessage) {
          this.onmessage(data);
        }
        this.emit("message", data);
      }
    
    });
    
    
    channels.WebSocketChannel = util.Class(AbstractChannel, {
    
      constructor: function (address) {
        if (address.search(/^https?:/i) === 0) {
          address = address.replace(/^http/i, 'ws');
        }
        this.address = address;
        this.socket = null;
        this._reopening = false;
        this._lastConnectTime = 0;
        this._backoff = 0;
        this.baseConstructor();
      },
    
      backoffTime: 50, // Milliseconds to add to each reconnect time
      maxBackoffTime: 1500,
      backoffDetection: 2000, // Amount of time since last connection attempt that shows we need to back off
    
      toString: function () {
        var s = '[WebSocketChannel to ' + this.address;
        if (! this.socket) {
          s += ' (socket unopened)';
        } else {
          s += ' readyState: ' + this.socket.readyState;
        }
        if (this.closed) {
          s += ' CLOSED';
        }
        return s + ']';
      },
    
      close: function () {
        this.closed = true;
        if (this.socket) {
          // socket.onclose will call this.onclose:
          this.socket.close();
        } else {
          if (this.onclose) {
            this.onclose();
          }
          this.emit("close");
        }
      },
    
      _send: function (data) {
        this.socket.send(data);
      },
    
      _ready: function () {
        return this.socket && this.socket.readyState == this.socket.OPEN;
      },
    
      _setupConnection: function () {
        if (this.closed) {
          return;
        }
        this._lastConnectTime = Date.now();
        this.socket = new WebSocket(this.address);
        this.socket.onopen = (function () {
          this._flush();
          this._reopening = false;
        }).bind(this);
        this.socket.onclose = (function (event) {
          this.socket = null;
          var method = "error";
          if (event.wasClean) {
            // FIXME: should I even log clean closes?
            method = "log";
          }
          console[method]('WebSocket close', event.wasClean ? 'clean' : 'unclean',
                          'code:', event.code, 'reason:', event.reason || 'none');
          if (! this.closed) {
            this._reopening = true;
            if (Date.now() - this._lastConnectTime > this.backoffDetection) {
              this._backoff = 0;
            } else {
              this._backoff++;
            }
            var time = Math.min(this._backoff * this.backoffTime, this.maxBackoffTime);
            setTimeout((function () {
              this._setupConnection();
            }).bind(this), time);
          }
        }).bind(this);
        this.socket.onmessage = (function (event) {
          this._incoming(event.data);
        }).bind(this);
        this.socket.onerror = (function (event) {
          console.error('WebSocket error:', event.data);
        }).bind(this);
      }
    
    });
    
    
    /* Sends TO a window or iframe */
    channels.PostMessageChannel = util.Class(AbstractChannel, {
      _pingPollPeriod: 100, // milliseconds
      _pingPollIncrease: 100, // +100 milliseconds for each failure
      _pingMax: 2000, // up to a max of 2000 milliseconds
    
      constructor: function (win, expectedOrigin) {
        this.expectedOrigin = expectedOrigin;
        this._pingReceived = false;
        this._receiveMessage = this._receiveMessage.bind(this);
        if (win) {
          this.bindWindow(win, true);
        }
        this._pingFailures = 0;
        this.baseConstructor();
      },
    
      toString: function () {
        var s = '[PostMessageChannel';
        if (this.window) {
          s += ' to window ' + this.window;
        } else {
          s += ' not bound to a window';
        }
        if (this.window && ! this._pingReceived) {
          s += ' still establishing';
        }
        return s + ']';
      },
    
      bindWindow: function (win, noSetup) {
        if (this.window) {
          this.close();
          // Though we deinitialized everything, we aren't exactly closed:
          this.closed = false;
        }
        if (win && win.contentWindow) {
          win = win.contentWindow;
        }
        this.window = win;
        // FIXME: The distinction between this.window and window seems unimportant
        // in the case of postMessage
        var w = this.window;
        // In a Content context we add the listener to the local window
        // object, but in the addon context we add the listener to some
        // other window, like the one we were given:
        if (typeof window != "undefined") {
          w = window;
        }
        w.addEventListener("message", this._receiveMessage, false);
        if (! noSetup) {
          this._setupConnection();
        }
      },
    
      _send: function (data) {
        this.window.postMessage(data, this.expectedOrigin || "*");
      },
    
      _ready: function () {
        return this.window && this._pingReceived;
      },
    
      _setupConnection: function () {
        if (this.closed || this._pingReceived || (! this.window)) {
          return;
        }
        this._pingFailures++;
        this._send("hello");
        // We'll keep sending ping messages until we get a reply
        var time = this._pingPollPeriod + (this._pingPollIncrease * this._pingFailures);
        time = time > this._pingPollMax ? this._pingPollMax : time;
        this._pingTimeout = setTimeout(this._setupConnection.bind(this), time);
      },
    
      _receiveMessage: function (event) {
        if (event.source !== this.window) {
          return;
        }
        if (this.expectedOrigin && event.origin != this.expectedOrigin) {
          console.info("Expected message from", this.expectedOrigin,
                       "but got message from", event.origin);
          return;
        }
        if (! this.expectedOrigin) {
          this.expectedOrigin = event.origin;
        }
        if (event.data == "hello") {
          this._pingReceived = true;
          if (this._pingTimeout) {
            clearTimeout(this._pingTimeout);
            this._pingTimeout = null;
          }
          this._flush();
          return;
        }
        this._incoming(event.data);
      },
    
      close: function () {
        this.closed = true;
        this._pingReceived = false;
        if (this._pingTimeout) {
          clearTimeout(this._pingTimeout);
        }
        window.removeEventListener("message", this._receiveMessage, false);
        if (this.onclose) {
          this.onclose();
        }
        this.emit("close");
      }
    
    });
    
    
    /* Handles message FROM an exterior window/parent */
    channels.PostMessageIncomingChannel = util.Class(AbstractChannel, {
    
      constructor: function (expectedOrigin) {
        this.source = null;
        this.expectedOrigin = expectedOrigin;
        this._receiveMessage = this._receiveMessage.bind(this);
        window.addEventListener("message", this._receiveMessage, false);
        this.baseConstructor();
      },
    
      toString: function () {
        var s = '[PostMessageIncomingChannel';
        if (this.source) {
          s += ' bound to source ' + s;
        } else {
          s += ' awaiting source';
        }
        return s + ']';
      },
    
      _send: function (data) {
        this.source.postMessage(data, this.expectedOrigin);
      },
    
      _ready: function () {
        return !!this.source;
      },
    
      _setupConnection: function () {
      },
    
      _receiveMessage: function (event) {
        if (this.expectedOrigin && this.expectedOrigin != "*" &&
            event.origin != this.expectedOrigin) {
          // FIXME: Maybe not worth mentioning?
          console.info("Expected message from", this.expectedOrigin,
                       "but got message from", event.origin);
          return;
        }
        if (! this.expectedOrigin) {
          this.expectedOrigin = event.origin;
        }
        if (! this.source) {
          this.source = event.source;
        }
        if (event.data == "hello") {
          // Just a ping
          this.source.postMessage("hello", this.expectedOrigin);
          return;
        }
        this._incoming(event.data);
      },
    
      close: function () {
        this.closed = true;
        window.removeEventListener("message", this._receiveMessage, false);
        if (this._pingTimeout) {
          clearTimeout(this._pingTimeout);
        }
        if (this.onclose) {
          this.onclose();
        }
        this.emit("close");
      }
    
    });
    
    channels.Router = util.Class(util.mixinEvents({
    
      constructor: function (channel) {
        this._channelMessage = this._channelMessage.bind(this);
        this._channelClosed = this._channelClosed.bind(this);
        this._routes = Object.create(null);
        if (channel) {
          this.bindChannel(channel);
        }
      },
    
      bindChannel: function (channel) {
        if (this.channel) {
          this.channel.removeListener("message", this._channelMessage);
          this.channel.removeListener("close", this._channelClosed);
        }
        this.channel = channel;
        this.channel.on("message", this._channelMessage.bind(this));
        this.channel.on("close", this._channelClosed.bind(this));
      },
    
      _channelMessage: function (msg) {
        if (msg.type == "route") {
          var id = msg.routeId;
          var route = this._routes[id];
          if (! route) {
            console.warn("No route with the id", id);
            return;
          }
          if (msg.close) {
            this._closeRoute(route.id);
          } else {
            if (route.onmessage) {
              route.onmessage(msg.message);
            }
            route.emit("message", msg.message);
          }
        }
      },
    
      _channelClosed: function () {
        for (var id in this._routes) {
          this._closeRoute(id);
        }
      },
    
      _closeRoute: function (id) {
        var route = this._routes[id];
        if (route.onclose) {
          route.onclose();
        }
        route.emit("close");
        delete this._routes[id];
      },
    
      makeRoute: function (id) {
        id = id || util.generateId();
        var route = Route(this, id);
        this._routes[id] = route;
        return route;
      }
    }));
    
    var Route = util.Class(util.mixinEvents({
      constructor: function (router, id) {
        this.router = router;
        this.id = id;
      },
    
      send: function (msg) {
        this.router.channel.send({
          type: "route",
          routeId: this.id,
          message: msg
        });
      },
    
      close: function () {
        if (this.router._routes[this.id] !== this) {
          // This route instance has been overwritten, so ignore
          return;
        }
        delete this.router._routes[this.id];
      }
    
    }));
    
    return channels;
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('storage',["util"], function (util) {
      var assert = util.assert;
      var Deferred = util.Deferred;
      var DEFAULT_SETTINGS = {
        dockConfig: null,
        name: "",
        defaultName: "",
        avatar: null,
        stickyShare: null,
        color: null,
        seenIntroDialog: false,
        seenWalkthrough: false,
        dontShowRtcInfo: false
      };
    
      var DEBUG_STORAGE = false;
    
      var Storage = util.Class({
        constructor: function (name, storage, prefix) {
          this.name = name;
          this.storage = storage;
          this.prefix = prefix;
        },
    
        get: function (key, defaultValue) {
          var self = this;
          return Deferred(function (def) {
            // Strictly this isn't necessary, but eventually I want to move to something more
            // async for the storage, and this simulates that much better.
            setTimeout(util.resolver(def, function () {
              key = self.prefix + key;
              var value = self.storage.getItem(key);
              if (! value) {
                value = defaultValue;
                if (DEBUG_STORAGE) {
                  console.debug("Get storage", key, "defaults to", value);
                }
              } else {
                value = JSON.parse(value);
                if (DEBUG_STORAGE) {
                  console.debug("Get storage", key, "=", value);
                }
              }
              return value;
            }));
          });
        },
    
        set: function (key, value) {
          var self = this;
          if (value !== undefined) {
            value = JSON.stringify(value);
          }
          return Deferred(function (def) {
            key = self.prefix + key;
            if (value === undefined) {
              self.storage.removeItem(key);
              if (DEBUG_STORAGE) {
                console.debug("Delete storage", key);
              }
            } else {
              self.storage.setItem(key, value);
              if (DEBUG_STORAGE) {
                console.debug("Set storage", key, value);
              }
            }
            setTimeout(def.resolve);
          });
        },
    
        clear: function () {
          var self = this;
          var promises = [];
          return Deferred((function (def) {
            this.keys().then(function (keys) {
              keys.forEach(function (key) {
                // FIXME: technically we're ignoring the promise returned by all
                // these sets:
                promises.push(self.set(key, undefined));
              });
              util.resolveMany(promises).then(function () {
                def.resolve();
              });
            });
          }).bind(this));
        },
    
        keys: function (prefix, excludePrefix) {
          // Returns a list of keys, potentially with the given prefix
          var self = this;
          return Deferred(function (def) {
            setTimeout(util.resolver(def, function () {
              prefix = prefix || "";
              var result = [];
              for (var i = 0; i < self.storage.length; i++) {
                var key = self.storage.key(i);
                if (key.indexOf(self.prefix + prefix) === 0) {
                  var shortKey = key.substr(self.prefix.length);
                  if (excludePrefix) {
                    shortKey = shortKey.substr(prefix.length);
                  }
                  result.push(shortKey);
                }
              }
              return result;
            }));
          });
        },
    
        toString: function () {
          return '[storage for ' + this.name + ']';
        }
    
      });
    
      var namePrefix = TogetherJS.config.get("storagePrefix");
      TogetherJS.config.close("storagePrefix");
    
      var storage = Storage('localStorage', localStorage, namePrefix + ".");
    
      storage.settings = util.mixinEvents({
        defaults: DEFAULT_SETTINGS,
    
        get: function (name) {
          assert(storage.settings.defaults.hasOwnProperty(name), "Unknown setting:", name);
          return storage.get("settings." + name, storage.settings.defaults[name]);
        },
    
        set: function (name, value) {
          assert(storage.settings.defaults.hasOwnProperty(name), "Unknown setting:", name);
          return storage.set("settings." + name, value);
        }
    
      });
    
      storage.tab = Storage('sessionStorage', sessionStorage, namePrefix + "-session.");
    
      return storage;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('session',["require", "util", "channels", "jquery", "storage"], function (require, util, channels, $, storage) {
    
      var DEBUG = false;
    
      // This is the amount of time in which a hello-back must be received after a hello
      // for us to respect a URL change:
      var HELLO_BACK_CUTOFF = 1500;
    
      var session = util.mixinEvents(util.Module("session"));
      var assert = util.assert;
    
      // We will load this module later (there's a circular import):
      var peers;
    
      // This is the hub we connect to:
      session.shareId = null;
      // This is the ID that identifies this client:
      session.clientId = null;
      session.router = channels.Router();
      // Indicates if TogetherJS has just started (not continuing from a saved session):
      session.firstRun = false;
    
      // This is the key we use for localStorage:
      var localStoragePrefix = "togetherjs.";
      // This is the channel to the hub:
      var channel = null;
    
      // Setting, essentially global:
      session.AVATAR_SIZE = 90;
    
      var MAX_SESSION_AGE = 30*24*60*60*1000; // 30 days
    
      /****************************************
       * URLs
       */
      var includeHashInUrl = TogetherJS.config.get("includeHashInUrl");
      TogetherJS.config.close("includeHashInUrl");
      var currentUrl = (location.href + "").replace(/\#.*$/, "");
      if (includeHashInUrl) {
        currentUrl = location.href;
      }
    
      session.hubUrl = function (id) {
        id = id || session.shareId;
        assert(id, "URL cannot be resolved before TogetherJS.shareId has been initialized");
        TogetherJS.config.close("hubBase");
        var hubBase = TogetherJS.config.get("hubBase");
        return hubBase.replace(/\/*$/, "") + "/hub/" + id;
      };
    
      session.shareUrl = function () {
        assert(session.shareId, "Attempted to access shareUrl() before shareId is set");
        var hash = location.hash;
        var m = /\?[^#]*/.exec(location.href);
        var query = "";
        if (m) {
          query = m[0];
        }
        hash = hash.replace(/&?togetherjs-[a-zA-Z0-9]+/, "");
        hash = hash || "#";
        return location.protocol + "//" + location.host + location.pathname + query +
               hash + "&togetherjs=" + session.shareId;
      };
    
      session.recordUrl = function () {
        assert(session.shareId);
        var url = TogetherJS.baseUrl.replace(/\/*$/, "") + "/togetherjs/recorder.html";
        url += "#&togetherjs=" + session.shareId + "&hubBase=" + TogetherJS.config.get("hubBase");
        return url;
      };
    
      /* location.href without the hash */
      session.currentUrl = function () {
        if (includeHashInUrl) {
          return location.href;
        } else {
          return location.href.replace(/#.*/, "");
        }
      };
    
      /****************************************
       * Message handling/dispatching
       */
    
      session.hub = util.mixinEvents({});
    
      var IGNORE_MESSAGES = TogetherJS.config.get("ignoreMessages");
      if (IGNORE_MESSAGES === true) {
        DEBUG = false;
        IGNORE_MESSAGES = [];
      }
      // These are messages sent by clients who aren't "part" of the TogetherJS session:
      var MESSAGES_WITHOUT_CLIENTID = ["who", "invite", "init-connection"];
    
      // We ignore incoming messages from the channel until this is true:
      var readyForMessages = false;
    
      function openChannel() {
        assert(! channel, "Attempt to re-open channel");
        console.info("Connecting to", session.hubUrl(), location.href);
        var c = channels.WebSocketChannel(session.hubUrl());
        c.onmessage = function (msg) {
          if (! readyForMessages) {
            if (DEBUG) {
              console.info("In (but ignored for being early):", msg);
            }
            return;
          }
          if (DEBUG && IGNORE_MESSAGES.indexOf(msg.type) == -1) {
            console.info("In:", msg);
          }
          if (! peers) {
            // We're getting messages before everything is fully initialized
            console.warn("Message received before all modules loaded (ignoring):", msg);
            return;
          }
          if ((! msg.clientId) && MESSAGES_WITHOUT_CLIENTID.indexOf(msg.type) == -1) {
            console.warn("Got message without clientId, where clientId is required", msg);
            return;
          }
          if (msg.clientId) {
            msg.peer = peers.getPeer(msg.clientId, msg);
          }
          if (msg.type == "hello" || msg.type == "hello-back" || msg.type == "peer-update") {
            try{
              // We do this here to make sure this is run before any other
              // hello handlers:
              msg.peer.updateFromHello(msg);
            }catch (e) {
              console.warn(e);
            }
          }
          if (msg.peer) {
            msg.sameUrl = msg.peer.url == currentUrl;
            if (!msg.peer.isSelf) {
              msg.peer.updateMessageDate(msg);
            }
          }
          session.hub.emit(msg.type, msg);
          TogetherJS._onmessage(msg);
        };
        channel = c;
        session.router.bindChannel(channel);
      }
    
      session.send = function (msg) {
        if (DEBUG && IGNORE_MESSAGES.indexOf(msg.type) == -1) {
          console.info("Send:", msg);
        }
        msg.clientId = session.clientId;
        channel.send(msg);
      };
    
      session.appSend = function (msg) {
        var type = msg.type;
        if (type.search(/^togetherjs\./) === 0) {
          type = type.substr("togetherjs.".length);
        } else if (type.search(/^app\./) === -1) {
          type = "app." + type;
        }
        msg.type = type;
        session.send(msg);
      };
    
      /****************************************
       * Standard message responses
       */
    
      /* Always say hello back, and keep track of peers: */
      session.hub.on("hello hello-back", function (msg) {
        if (msg.type == "hello") {
          sendHello(true);
        }
        if (session.isClient && (! msg.isClient) &&
            session.firstRun && session.timeHelloSent &&
            Date.now() - session.timeHelloSent < HELLO_BACK_CUTOFF) {
          processFirstHello(msg);
        }
      });
    
      session.hub.on("who", function (msg) {
        sendHello(true);
      });
    
      function processFirstHello(msg) {
        if (! msg.sameUrl) {
          var url = msg.url;
          if (msg.urlHash) {
            url += msg.urlHash;
          }
          require("ui").showUrlChangeMessage(msg.peer, url);
          location.href = url;
        }
      }
    
      session.timeHelloSent = null;
    
      function sendHello(helloBack) {
        var msg = session.makeHelloMessage(helloBack);
        if (! helloBack) {
          session.timeHelloSent = Date.now();
          peers.Self.url = msg.url;
        }
        session.send(msg);
      }
    
      session.makeHelloMessage = function (helloBack) {
        var msg = {
          name: peers.Self.name || peers.Self.defaultName,
          avatar: peers.Self.avatar,
          color: peers.Self.color,
          url: session.currentUrl(),
          urlHash: location.hash,
          // FIXME: titles update, we should track those changes:
          title: document.title,
          rtcSupported: session.RTCSupported,
          isClient: session.isClient
        };
        if (helloBack) {
          msg.type = "hello-back";
        } else {
          msg.type = "hello";
          msg.clientVersion = TogetherJS.version;
        }
        if (! TogetherJS.startup.continued) {
          msg.starting = true;
        }
        // This is a chance for other modules to effect the hello message:
        session.emit("prepare-hello", msg);
        return msg;
      };
      /****************************************
       * Lifecycle (start and end)
       */
    
      // These are Javascript files that implement features, and so must
      // be injected at runtime because they aren't pulled in naturally
      // via define().
      // ui must be the first item:
      var features = ["peers", "ui", "chat", "webrtc", "cursor", "startup", "videos", "forms", "visibilityApi", "youtubeVideos"];
    
      function getRoomName(prefix, maxSize) {
        var findRoom = TogetherJS.config.get("hubBase").replace(/\/*$/, "") + "/findroom";
        return $.ajax({
          url: findRoom,
          dataType: "json",
          data: {prefix: prefix, max: maxSize}
        }).then(function (resp) {
          return resp.name;
        });
      }
    
      function initIdentityId() {
        return util.Deferred(function (def) {
          if (session.identityId) {
            def.resolve();
            return;
          }
          storage.get("identityId").then(function (identityId) {
            if (! identityId) {
              identityId = util.generateId();
              storage.set("identityId", identityId);
            }
            session.identityId = identityId;
            // We don't actually have to wait for the set to succede, so
            // long as session.identityId is set
            def.resolve();
          });
        });
      }
    
      initIdentityId.done = initIdentityId();
    
      function initShareId() {
        return util.Deferred(function (def) {
          var hash = location.hash;
          var shareId = session.shareId;
          var isClient = true;
          var set = true;
          var sessionId;
          var isClientKey;
          session.firstRun = ! TogetherJS.startup.continued;
          if (! shareId) {
            if (TogetherJS.startup._joinShareId) {
              // Like, below, this *also* means we got the shareId from the hash
              // (in togetherjs.js):
              shareId = TogetherJS.startup._joinShareId;
            }
          }
          if (! shareId) {
            // FIXME: I'm not sure if this will ever happen, because togetherjs.js should
            // handle it
            var m = /&?togetherjs=([^&]*)/.exec(hash);
            if (m) {
              isClient = ! m[1];
              shareId = m[2];
              var newHash = hash.substr(0, m.index) + hash.substr(m.index + m[0].length);
              location.hash = newHash;
            }
          }
          return storage.tab.get("status").then(function (saved) {
            var findRoom = TogetherJS.config.get("findRoom");
            TogetherJS.config.close("findRoom");
            if (findRoom && saved && findRoom != saved.shareId) {
              console.info("Ignoring findRoom in lieu of continued session");
            } else if (findRoom && TogetherJS.startup._joinShareId) {
              console.info("Ignoring findRoom in lieu of explicit invite to session");
            }
            if (findRoom && typeof findRoom == "string" && (! saved) && (! TogetherJS.startup._joinShareId)) {
              isClient = true;
              shareId = findRoom;
              sessionId = util.generateId();
            } else if (findRoom && (! saved) && (! TogetherJS.startup._joinShareId)) {
              assert(findRoom.prefix && typeof findRoom.prefix == "string", "Bad findRoom.prefix", findRoom);
              assert(findRoom.max && typeof findRoom.max == "number" && findRoom.max > 0,
                     "Bad findRoom.max", findRoom);
              sessionId = util.generateId();
              if (findRoom.prefix.search(/[^a-zA-Z0-9]/) != -1) {
                console.warn("Bad value for findRoom.prefix:", JSON.stringify(findRoom.prefix));
              }
              getRoomName(findRoom.prefix, findRoom.max).then(function (shareId) {
                // FIXME: duplicates code below:
                session.clientId = session.identityId + "." + sessionId;
                storage.tab.set("status", {reason: "joined", shareId: shareId, running: true, date: Date.now(), sessionId: sessionId});
                session.isClient = true;
                session.shareId = shareId;
                session.emit("shareId");
                def.resolve(session.shareId);
              });
              return;
            } else if (TogetherJS.startup._launch) {
              if (saved) {
                isClientKey = storage.tab.prefix + 'isClient';
                isClient = JSON.parse(storage.tab.storage[isClientKey]);
                //isClient = saved.reason == "joined";
                if (! shareId) {
                  shareId = saved.shareId;
                }
                sessionId = saved.sessionId;
              } else {
                isClient = TogetherJS.startup.reason == "joined";
                assert(! sessionId);
                sessionId = util.generateId();
              }
              if (! shareId) {
                shareId = util.generateId();
              }
            } else if (saved) {
              isClient = saved.reason == "joined";
              TogetherJS.startup.reason = saved.reason;
              TogetherJS.startup.continued = true;
              shareId = saved.shareId;
              sessionId = saved.sessionId;
              // The only case when we don't need to set the storage status again is when
              // we're already set to be running
              set = ! saved.running;
            } else {
              throw new util.AssertionError("No saved status, and no startup._launch request; why did TogetherJS start?");
            }
            assert(session.identityId);
            session.clientId = session.identityId + "." + sessionId;
            if (set) {
              storage.tab.set("status", {reason: TogetherJS.startup.reason, shareId: shareId, running: true, date: Date.now(), sessionId: sessionId});
            }
            session.isClient = isClient;
            session.shareId = shareId;
            session.emit("shareId");
            def.resolve(session.shareId);
          });
        });
      }
    
      function initStartTarget() {
        var id;
        if (TogetherJS.startup.button) {
          id = TogetherJS.startup.button.id;
          if (id) {
            storage.set("startTarget", id);
          }
          return;
        }
        storage.get("startTarget").then(function (id) {
          var el = document.getElementById(id);
          if (el) {
            TogetherJS.startup.button = el;
          }
        });
      }
      session.start = function () {
        initStartTarget();
        initIdentityId().then(function () {
          initShareId().then(function () {
            readyForMessages = false;
            openChannel();
            require(["ui"], function (ui) {
              TogetherJS.running = true;
              ui.prepareUI();
              require(features, function () {
                $(function () {
                  peers = require("peers");
                  var startup = require("startup");
                  session.emit("start");
                  session.once("ui-ready", function () {
                    readyForMessages = true;
                    startup.start();
                  });
                  ui.activateUI();
                  TogetherJS.config.close("enableAnalytics");
                  if (TogetherJS.config.get("enableAnalytics")) {
                    require(["analytics"], function (analytics) {
                      analytics.activate();
                    });
                  }
                  peers._SelfLoaded.then(function () {
                    sendHello(false);
                  });
                  TogetherJS.emit("ready");
                });
              });
            });
          });
        });
      };
    
      session.close = function (reason) {
        TogetherJS.running = false;
        var msg = {type: "bye"};
        if (reason) {
          msg.reason = reason;
        }
        session.send(msg);
        session.emit("close");
        var name = window.name;
        storage.tab.get("status").then(function (saved) {
          if (! saved) {
            console.warn("No session information saved in", "status." + name);
          } else {
            saved.running = false;
            saved.date = Date.now();
            storage.tab.set("status", saved);
          }
          channel.close();
          channel = null;
          session.shareId = null;
          session.emit("shareId");
          TogetherJS.emit("close");
          TogetherJS._teardown();
        });
      };
    
      session.on("start", function () {
        $(window).on("resize", resizeEvent);
        if (includeHashInUrl) {
          $(window).on("hashchange", hashchangeEvent);
        }
        storage.tab.get('isClient').then(function(client) {
          if (typeof (client) === 'undefined') {
            storage.tab.set('isClient', session.isClient);
          }
        });
      });
    
      session.on("close", function () {
        $(window).off("resize", resizeEvent);
        if (includeHashInUrl) {
          $(window).off("hashchange", hashchangeEvent);
        }
      });
    
      function hashchangeEvent() {
        // needed because when message arives from peer this variable will be checked to
        // decide weather to show actions or not
        sendHello(false);
      }
    
      function resizeEvent() {
        session.emit("resize");
      }
    
      if (TogetherJS.startup._launch) {
        setTimeout(session.start);
      }
    
      util.testExpose({
        getChannel: function () {
          return channel;
        }
      });
    
      return session;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('templates',["util"], function (util) {
      function clean(t) {
        // Removes <% /* ... */ %> comments:
        t = t.replace(/[<][%]\s*\/\*[\S\s\r\n]*\*\/\s*[%][>]/, "");
        t = util.trim(t);
        t = t.replace(/http:\/\/localhost:8080/g, TogetherJS.baseUrl);
        return t;
      }
      return {
        "interface": clean("<% /*\n   This is basically all the markup and interface for TogetherJS.\n   Note all links should be like http://localhost:8080/togetherjs/*\n   these links are rewritten with the location where TogetherJS was deployed.\n\n   This file is inlined into togetherjs/templates.js\n*/ %>\n<div id=\"togetherjs-container\" class=\"togetherjs\">\n\n  <!-- This is the main set of buttons: -->\n  <div id=\"togetherjs-dock\" class=\"togetherjs-dock-right\">\n    <div id=\"togetherjs-dock-anchor\" title=\"Move the dock\">\n      <span id=\"togetherjs-dock-anchor-horizontal\">\n        <img src=\"http://localhost:8080/togetherjs/images/icn-handle-circle@2x.png\" alt=\"drag\">\n      </span>\n      <span id=\"togetherjs-dock-anchor-vertical\">\n        <img src=\"http://localhost:8080/togetherjs/images/icn-handle-circle@2x.png\" alt=\"drag\">\n      </span>\n    </div>\n    <div id=\"togetherjs-buttons\">\n      <div style=\"display: none\">\n        <button id=\"togetherjs-template-dock-person\" class=\"togetherjs-button togetherjs-dock-person\">\n          <div class=\"togetherjs-tooltip togetherjs-dock-person-tooltip\">\n            <span class=\"togetherjs-person-name\"></span>\n            <span class=\"togetherjs-person-tooltip-arrow-r\"></span>\n          </div>\n          <div class=\"togetherjs-person togetherjs-person-status-overlay\"></div>\n        </button>\n      </div>\n      <button id=\"togetherjs-profile-button\" class=\"togetherjs-button\" title=\"This is you\">\n        <div class=\"togetherjs-person togetherjs-person-self\"></div>\n        <div id=\"togetherjs-profile-arrow\"></div>\n      </button>\n      <button id=\"togetherjs-share-button\" class=\"togetherjs-button\" title=\"Add a friend\"></button>\n      <button id=\"togetherjs-audio-button\" class=\"togetherjs-button\" title=\"Turn on microphone\">\n        <span id=\"togetherjs-audio-unavailable\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\">\n        </span>\n        <span id=\"togetherjs-audio-ready\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\" style=\"display: none\">\n        </span>\n        <span id=\"togetherjs-audio-outgoing\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\" style=\"display: none\">\n        </span>\n        <span id=\"togetherjs-audio-incoming\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\" style=\"display: none\">\n        </span>\n        <span id=\"togetherjs-audio-active\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\" style=\"display: none\">\n        </span>\n        <span id=\"togetherjs-audio-muted\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\" style=\"display: none\">\n        </span>\n        <span id=\"togetherjs-audio-error\" class=\"togetherjs-audio-set\" data-toggles=\".togetherjs-audio-set\" style=\"display: none\">\n        </span>\n      </button>\n      <button id=\"togetherjs-chat-button\" class=\"togetherjs-button\" title=\"Chat\"></button>\n      <div id=\"togetherjs-dock-participants\"></div>\n    </div>\n  </div>\n\n  <!-- The window for editing the avatar: -->\n  <div id=\"togetherjs-avatar-edit\" class=\"togetherjs-modal\"\n       style=\"display: none\">\n    <header> Update avatar </header>\n    <section>\n      <div class=\"togetherjs-avatar-preview togetherjs-person togetherjs-person-self\"></div>\n      <div id=\"togetherjs-avatar-buttons\">\n        <input type=\"file\" class=\"togetherjs-upload-avatar\">\n        <!--<button id=\"togetherjs-upload-avatar\" class=\"togetherjs-primary\">Upload a picture</button>-->\n        <!--<button id=\"togetherjs-camera-avatar\" class=\"togetherjs-default\">Take a picture</button>-->\n      </div>\n    </section>\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-cancel togetherjs-dismiss\">Cancel</button>\n      <span class=\"togetherjs-alt-text\">or</span>\n      <button class=\"togetherjs-avatar-save togetherjs-primary\">Save</button>\n    </section>\n  </div>\n\n  <!-- The window for sharing the link: -->\n  <div id=\"togetherjs-share\" class=\"togetherjs-window\"\n       data-bind-to=\"#togetherjs-share-button\" style=\"display: none\">\n    <header> Invite a friend </header>\n    <section>\n      <div class=\"togetherjs-not-mobile\">\n        <p>Copy and paste this link over IM or email:</p>\n        <input type=\"text\" class=\"togetherjs-share-link\">\n      </div>\n      <div class=\"togetherjs-only-mobile\">\n        <p>Copy and paste this link over IM or email:</p>\n        <input type=\"text\" class=\"togetherjs-share-link\">\n        <!-- <a class=\"togetherjs-share-link\" href=\"#\">Press your thumb here.</a> -->\n      </div>\n    </section>\n  </div>\n\n  <!-- Participant Full List view template: -->\n  <div id=\"togetherjs-participantlist\" class=\"togetherjs-window\"\n       data-bind-to=\"#togetherjs-participantlist-button\" style=\"display: none\">\n    <header> Participants </header>\n    <section>\n      <div class=\"togetherjs-not-mobile\">\n        <ul>\n          <li id=\"togetherjs-participant-item\">\n            <img class=\"togetherjs-person togetherjs-person-small\" src=\"http://localhost:8080/togetherjs/images/btn-menu-change-avatar.png\">\n            <span class=\"tj-name togetherjs-person-name\">Useronewith alongname</span>\n            <span class=\"tj-status\">&#9679;</span>\n            <p class=\"tj-urllocation\">Currently at: <a class=\"togetherjs-person-url togetherjs-person-url-title\" href=\"\">http://www.location.comwww.location.comwww.location.comasdfsafd</a></p>\n            <p class=\"tj-follow\">Follow:\n              <label class=\"togetherjs-follow-question\" for=\"togetherjs-person-status-follow\">\n                <input type=\"checkbox\" id=\"togetherjs-person-status-follow\">\n              </label>\n            </p>\n            <section class=\"togetherjs-buttons\">\n              <!-- Displayed when the peer is at a different URL: -->\n              <div class=\"togetherjs-different-url\">\n                <a class=\"togetherjs-nudge togetherjs-default tj-btn-sm\">Nudge them</a>\n                <a href=\"#\" class=\"togetherjs-follow togetherjs-person-url togetherjs-primary tj-btn-sm\">Join them</a>\n              </div>\n              <!-- Displayed when the peer is at your same URL: -->\n              <div class=\"togetherjs-same-url\" style=\"display: none\">\n                <span class=\"togetherjs-person-name\"></span> is on the same page as you.\n              </div>\n            </section>\n          </li>\n        </ul>\n    </section>\n  </div>\n\n  <!-- Participant detail template: -->\n  <div id=\"togetherjs-template-participant-window\" class=\"togetherjs-window\" style=\"display: none\">\n    <header><div class=\"togetherjs-person togetherjs-person-small\"></div><span class=\"togetherjs-person-name\"></span></header>\n\n    <section class=\"togetherjs-participant-window-main\">\n      <p class=\"togetherjs-participant-window-row\"><strong>Role:</strong>\n        <span class=\"togetherjs-person-role\"></span>\n      </p>\n\n      <p class=\"togetherjs-participant-window-row\"><strong>Currently at:</strong>\n        <a class=\"togetherjs-person-url togetherjs-person-url-title\"></a>\n      </p>\n\n      <p class=\"togetherjs-participant-window-row\"><strong>Status:</strong>\n        <span class=\"togetherjs-person-status\"></span>\n      </p>\n\n      <p class=\"togetherjs-participant-window-row\"><strong class=\"togetherjs-float-left\">Follow this participant:</strong>\n        <label class=\"togetherjs-follow-question togetherjs-float-left\" for=\"togetherjs-person-status-follow\">\n          <input type=\"checkbox\" id=\"togetherjs-person-status-follow\">\n        </label>\n        <span class=\"togetherjs-clear\"></span>\n      </p>\n\n    </section>\n\n    <section class=\"togetherjs-buttons\">\n      <!-- Displayed when the peer is at a different URL: -->\n      <div class=\"togetherjs-different-url\">\n        <a class=\"togetherjs-nudge togetherjs-default\">Nudge them</a>\n        <a href=\"#\" class=\"togetherjs-follow togetherjs-person-url togetherjs-primary\">Join them</a>\n      </div>\n      <!-- Displayed when the peer is at your same URL: -->\n      <div class=\"togetherjs-same-url\" style=\"display: none\">\n        <span class=\"togetherjs-person-name\"></span> is on the same page as you.\n      </div>\n    </section>\n  </div>\n\n  <!-- The chat screen: -->\n  <div id=\"togetherjs-chat\" class=\"togetherjs-window\" data-bind-to=\"#togetherjs-chat-button\"\n       style=\"display: none\">\n    <header> Chat </header>\n    <section class=\"togetherjs-subtitle\">\n      <div id=\"togetherjs-chat-participants\" data-toggles=\"#togetherjs-chat-no-participants\" style=\"display: none\">\n        <span id=\"togetherjs-chat-participant-list\"></span>\n        &amp; You\n      </div>\n      <div id=\"togetherjs-chat-no-participants\" data-toggles=\"#togetherjs-chat-participants\">\n        No one else is here.\n      </div>\n    </section>\n\n    <div style=\"display: none\">\n\n      <!-- Template for one message: -->\n      <div id=\"togetherjs-template-chat-message\" class=\"togetherjs-chat-item togetherjs-chat-message\">\n        <div class=\"togetherjs-person\"></div>\n        <div class=\"togetherjs-timestamp\"><span class=\"togetherjs-time\">HH:MM</span> <span class=\"togetherjs-ampm\">AM/PM</span></div>\n        <div class=\"togetherjs-person-name-abbrev\"></div>\n        <div class=\"togetherjs-chat-content togetherjs-sub-content\"></div>\n      </div>\n\n      <!-- Template for when a person leaves: -->\n      <div id=\"togetherjs-template-chat-left\" class=\"togetherjs-chat-item togetherjs-chat-left-item\">\n        <div class=\"togetherjs-person\"></div>\n        <div class=\"togetherjs-ifnot-declinedJoin\">\n          <div class=\"togetherjs-inline-text\"><span class=\"togetherjs-person-name\"></span> left the session.</div>\n        </div>\n        <div class=\"togetherjs-if-declinedJoin\">\n          <div class=\"togetherjs-inline-text\"><span class=\"togetherjs-person-name\"></span> declined to join the session.</div>\n        </div>\n        <div class=\"togetherjs-clear\"></div>\n      </div>\n\n      <!-- Template when a person joins the session: -->\n      <div id=\"togetherjs-template-chat-joined\" class=\"togetherjs-chat-item togetherjs-chat-join-item\">\n        <div class=\"togetherjs-person\"></div>\n        <div class=\"togetherjs-inline-text\"><span class=\"togetherjs-person-name\"></span> joined the session.</div>\n        <div class=\"togetherjs-clear\"></div>\n      </div>\n\n      <!-- Template for system-derived messages: -->\n      <div id=\"togetherjs-template-chat-system\" class=\"togetherjs-chat-item\">\n        <span class=\"togetherjs-chat-content togetherjs-sub-content\"></span>\n      </div>\n\n      <!-- Template when a person joins the session: -->\n      <!-- <div id=\"togetherjs-template-chat-joined\" class=\"togetherjs-chat-item togetherjs-chat-join-item\">\n        <div class=\"togetherjs-person\"></div>\n        <div class=\"togetherjs-inline-text\"><span class=\"togetherjs-person-name\"></span> joined the session.</div>\n        <div class=\"togetherjs-clear\"></div>\n      </div> -->\n\n      <!-- Template for when someone goes to a new URL: -->\n      <div id=\"togetherjs-template-url-change\" class=\"togetherjs-chat-item togetherjs-chat-url-change\">\n        <div class=\"togetherjs-person\"></div>\n        <div class=\"togetherjs-inline-text\">\n          <div class=\"togetherjs-if-sameUrl\">\n            <span class=\"togetherjs-person-name\"></span>\n            is on the same page as you.\n          </div>\n          <div class=\"togetherjs-ifnot-sameUrl\">\n            <span class=\"togetherjs-person-name\"></span>\n            has gone to: <a href=\"#\" class=\"togetherjs-person-url togetherjs-person-url-title\" target=\"_self\"></a>\n            <section class=\"togetherjs-buttons togetherjs-buttons-notification-diff-url\">\n              <!-- Displayed when the peer is at a different URL: -->\n              <div class=\"togetherjs-different-url togetherjs-notification-diff-url\">\n                <a class=\"togetherjs-nudge togetherjs-default\">Nudge them</a>\n                <a href=\"#\" class=\"togetherjs-follow togetherjs-person-url togetherjs-primary\">Join them</a>\n              </div>\n            </section>\n\n            <!-- <div>\n              <a class=\"togetherjs-nudge togetherjs-secondary\">Nudge them</a>\n              <a href=\"\" class=\"togetherjs-person-url togetherjs-follow togetherjs-primary\">Join them</a>\n            </div> -->\n\n          </div>\n        </div>\n        <div class=\"togetherjs-clear\"></div>\n      </div>\n    </div>\n\n    <section id=\"togetherjs-chat-messages\">\n      <!-- FIX ME// need to have some dialogue that says something like - There are no chats yet! -->\n    </section>\n    <section id=\"togetherjs-chat-input-box\">\n      <textarea id=\"togetherjs-chat-input\" placeholder=\"Type your message here\"></textarea>\n    </section>\n  </div>\n\n  <!-- this is a kind of warning popped up when you (successfully) start RTC: -->\n  <div id=\"togetherjs-rtc-info\" class=\"togetherjs-window\"\n       data-bind-to=\"#togetherjs-audio-button\"\n       style=\"display: none\">\n\n    <header> Audio Chat </header>\n    <section>\n      <p>\n        Activate your <strong>browser microphone</strong> near your URL bar above.\n      </p>\n      <p>\n        Talking on your microphone through your web browser is an experimental feature.\n      </p>\n      <p>\n        Read more about Audio Chat <a href=\"https://github.com/mozilla/togetherjs/wiki/About-Audio-Chat-and-WebRTC\" target=\"_blank\">here</a>.\n      </p>\n    </section>\n\n    <section class=\"togetherjs-buttons\">\n      <label for=\"togetherjs-rtc-info-dismiss\" style=\"display: inline;\">\n        <input class=\"togetherjs-dont-show-again\" id=\"togetherjs-rtc-info-dismiss\" type=\"checkbox\">\n        Don't show again.\n      </label>\n      <button class=\"togetherjs-default togetherjs-dismiss\" type=\"button\">Close</button>\n    </section>\n  </div>\n\n  <!-- this is popped up when you hit the audio button, but RTC isn't\n  supported: -->\n  <div id=\"togetherjs-rtc-not-supported\" class=\"togetherjs-window\"\n       data-bind-to=\"#togetherjs-audio-button\"\n       style=\"display: none\">\n    <header> Audio Chat </header>\n\n    <section>\n      <p>Audio chat requires you to use a <a href=\"https://github.com/mozilla/togetherjs/wiki/About-Audio-Chat-and-WebRTC\" target=\"_blank\">\n        newer browser\n      </a>!</p>\n      <p>\n        Live audio chat requires a newer (or different) browser than you're using.\n      </p>\n      <p>\n        See\n        <a href=\"https://github.com/mozilla/togetherjs/wiki/About-Audio-Chat-and-WebRTC\" target=\"_blank\">\n          this page\n        </a>\n        for more information and a list of supported browsers.\n      </p>\n    </section>\n\n    <section class=\"togetherjs-buttons\">\n      <div class=\"togetherjs-rtc-dialog-btn\">\n        <button class=\"togetherjs-default togetherjs-dismiss\" type=\"button\">Close</button>\n      </div>\n    </section>\n  </div>\n\n  <!-- The popup when a chat message comes in and the #togetherjs-chat window isn't open -->\n  <div id=\"togetherjs-chat-notifier\" class=\"togetherjs-notification\"\n       data-bind-to=\"#togetherjs-chat-button\"\n       style=\"display: none\">\n    <img src=\"http://localhost:8080/togetherjs/images/notification-togetherjs-logo.png\" class=\"togetherjs-notification-logo\" alt=\"\">\n    <img src=\"http://localhost:8080/togetherjs/images/notification-btn-close.png\" class=\"togetherjs-notification-closebtn togetherjs-dismiss\" alt=\"[close]\">\n    <section id=\"togetherjs-chat-notifier-message\">\n    </section>\n  </div>\n\n  <!-- The menu when you click on the profile: -->\n  <div id=\"togetherjs-menu\" class=\"togetherjs-menu\" style=\"display: none\">\n    <div class=\"togetherjs-menu-item togetherjs-menu-disabled\" id=\"togetherjs-menu-profile\">\n      <img id=\"togetherjs-menu-avatar\">\n      <span class=\"togetherjs-person-name-self\" id=\"togetherjs-self-name-display\" data-toggles=\"#togetherjs-menu .togetherjs-self-name\"></span>\n      <input class=\"togetherjs-self-name\" type=\"text\" data-toggles=\"#togetherjs-self-name-display\" style=\"display: none\" placeholder=\"Enter your name\">\n    </div>\n    <div class=\"togetherjs-menu-hr-avatar\"></div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-update-name\"><img src=\"http://localhost:8080/togetherjs/images/button-pencil.png\" alt=\"\"> Update your name</div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-update-avatar\"><img src=\"http://localhost:8080/togetherjs/images/btn-menu-change-avatar.png\" alt=\"\"> Change avatar</div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-update-color\"><span class=\"togetherjs-person-bgcolor-self\"></span> Pick profile color</div>\n    <div class=\"togetherjs-hr\"></div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-help\">Help</div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-feedback\">Feedback</div>\n    <div id=\"togetherjs-invite\" style=\"display: none\">\n      <div class=\"togetherjs-hr\"></div>\n      <div id=\"togetherjs-invite-users\"></div>\n      <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-refresh-invite\">Refresh users</div>\n      <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-invite-anyone\">Invite anyone</div>\n    </div>\n    <div class=\"togetherjs-hr\"></div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-end\"><img src=\"http://localhost:8080/togetherjs/images/button-end-session.png\" alt=\"\"> End <span class=\"togetherjs-tool-name\">TogetherJS</span></div>\n  </div>\n\n  <!-- template for one person in the invite-users list -->\n  <div style=\"display: none\">\n    <div id=\"togetherjs-template-invite-user-item\" class=\"togetherjs-menu-item\">\n      <!-- FIXME: should include avatar in some way -->\n      <span class=\"togetherjs-person-name\"></span>\n    </div>\n  </div>\n\n  <!-- A window version of #togetherjs-menu, for use on mobile -->\n  <div id=\"togetherjs-menu-window\" class=\"togetherjs-window\" style=\"display: none\">\n    <header>Settings and Profile</header>\n    <section>\n    <div class=\"togetherjs-menu-item\">\n      <img class=\"togetherjs-menu-avatar\">\n      <span class=\"togetherjs-person-name-self\" id=\"togetherjs-self-name-display\"></span>\n    </div>\n    <div class=\"togetherjs-menu-hr-avatar\"></div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-update-name-button\"><img src=\"http://localhost:8080/togetherjs/images/button-pencil.png\" alt=\"\"> Update your name</div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-update-avatar-button\"><img src=\"http://localhost:8080/togetherjs/images/btn-menu-change-avatar.png\" alt=\"\"> Change avatar</div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-update-color-button\"><span class=\"togetherjs-person-bgcolor-self\"></span> Pick profile color</div>\n    <div class=\"togetherjs-hr\"></div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-help-button\">Help</div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-feedback-button\">Feedback</div>\n    <div class=\"togetherjs-hr\"></div>\n    <div class=\"togetherjs-menu-item\" id=\"togetherjs-menu-end-button\"><img src=\"http://localhost:8080/togetherjs/images/button-end-session.png\" alt=\"\"> End <span class=\"togetherjs-tool-name\">TogetherJS</span></div>\n    </section>\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-dismiss togetherjs-primary\">OK</button>\n    </section>\n  </div>\n\n  <!-- The name editor, for use on mobile -->\n  <div id=\"togetherjs-edit-name-window\" class=\"togetherjs-window\" style=\"display: none\">\n    <header>Update Name</header>\n    <section>\n      <div>\n        <input class=\"togetherjs-self-name\" type=\"text\" placeholder=\"Enter your name\">\n      </div>\n    </section>\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-dismiss togetherjs-primary\">OK</button>\n    </section>\n  </div>\n\n  <div class=\"togetherjs-menu\" id=\"togetherjs-pick-color\" style=\"display: none\">\n    <div class=\"togetherjs-triangle-up\"><img src=\"http://localhost:8080/togetherjs/images/icn-triangle-up.png\"></div>\n    <div style=\"display: none\">\n      <div id=\"togetherjs-template-swatch\" class=\"togetherjs-swatch\">\n      </div>\n    </div>\n  </div>\n\n  <!-- Invisible elements that handle the RTC audio: -->\n  <audio id=\"togetherjs-audio-element\"></audio>\n  <audio id=\"togetherjs-local-audio\" muted=\"true\" volume=\"0.3\"></audio>\n  <audio id=\"togetherjs-notification\" src=\"http://localhost:8080/togetherjs/images/notification.ogg\"></audio>\n\n  <!-- The intro screen for someone who joins a session the first time: -->\n  <div id=\"togetherjs-intro\" class=\"togetherjs-modal\" style=\"display: none\">\n    <header>Join <span class=\"togetherjs-tool-name\">TogetherJS</span> session?</header>\n    <section>\n      <p>Your friend has asked you to join their <a href=\"https://togetherjs.mozillalabs.com/\" target=\"_blank\"><span class=\"togetherjs-tool-name\">TogetherJS</span></a> browser session to collaborate in real-time!</p>\n\n      <p>Would you like to join their session?</p>\n    </section>\n\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-destructive togetherjs-modal-dont-join\">No, don't join</button>\n      <button class=\"togetherjs-primary togetherjs-dismiss\">Yes, join session</button>\n    </section>\n  </div>\n\n  <!-- Shown when a web browser is completely incapable of running TogetherJS: -->\n  <div id=\"togetherjs-browser-broken\" class=\"togetherjs-modal\" style=\"display: none\">\n    <header> Sorry </header>\n\n    <section>\n      <p>\n        We're sorry, <span class=\"togetherjs-tool-name\">TogetherJS</span> doesn't work with this browser.  Please\n        <a href=\"https://github.com/mozilla/togetherjs/wiki/Supported-Browsers#supported-browsers\">upgrade\n          to a supported browser</a> to try <span class=\"togetherjs-tool-name\">TogetherJS</span>.\n      </p>\n\n      <p id=\"togetherjs-browser-broken-is-ie\" style=\"display: none\">\n        We need your help fixing TogetherJS on Internet Explorer!  Here are a list of IE <a href=\"https://github.com/mozilla/togetherjs/issues?labels=IE&milestone=&page=1&state=open\" target=\"_blank\">GitHub issues</a> we need fixed that you can work on.\n        Internet Explorer <a href=\"https://github.com/mozilla/togetherjs/wiki/Supported-Browsers#internet-explorer\">is\n          currently not supported</a>.  If you do want to try out TogetherJS, we'd suggest using Firefox or Chrome.\n      </p>\n    </section>\n\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-dismiss togetherjs-primary\">End <span class=\"togetherjs-tool-name\">TogetherJS</span></button>\n    </section>\n\n  </div>\n\n  <!-- Shown when the browser has WebSockets, but is IE (i.e., IE10) -->\n  <div id=\"togetherjs-browser-unsupported\" class=\"togetherjs-modal\" style=\"display: none\">\n    <header> Unsupported Browser </header>\n\n    <section>\n      <p>\n        We need your help fixing TogetherJS on Internet Explorer!  Here are a list of IE <a href=\"https://github.com/mozilla/togetherjs/issues?labels=IE&milestone=&page=1&state=open\" target=\"_blank\">GitHub issues</a> we need fixed that you can work on.\n        Internet Explorer <a href=\"https://github.com/mozilla/togetherjs/wiki/Supported-Browsers#internet-explorer\">is not supported</a>\n        at this time.  While we may add support later, adding support is\n        not currently on our roadmap.  If you do want to try out TogetherJS, we'd suggest using Firefox or Chrome.\n      </p>\n\n      <p>You can continue to try to use <span class=\"togetherjs-tool-name\">TogetherJS</span>, but you are likely to hit\n        lots of bugs.  So be warned.</p>\n\n    </section>\n\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-dismiss togetherjs-primary\">End <span class=\"togetherjs-tool-name\">TogetherJS</span></button>\n      <button class=\"togetherjs-dismiss togetherjs-secondary togetherjs-browser-unsupported-anyway\">Try <span class=\"togetherjs-tool-name\">TogetherJS</span> Anyway</button>\n    </section>\n\n  </div>\n\n  <div id=\"togetherjs-confirm-end\" class=\"togetherjs-modal\" style=\"display: none\">\n    <header> End session? </header>\n    <section>\n      <p>\n        Are you sure you'd like to end your <span class=\"togetherjs-tool-name\">TogetherJS</span> session?\n      </p>\n    </section>\n    <section class=\"togetherjs-buttons\">\n      <button class=\"togetherjs-cancel togetherjs-dismiss\">Cancel</button>\n      <span class=\"togetherjs-alt-text\">or</span>\n      <button id=\"togetherjs-end-session\" class=\"togetherjs-destructive\">End session</button>\n    </section>\n  </div>\n\n  <div id=\"togetherjs-feedback-form\" class=\"togetherjs-modal\" style=\"display: none;\">\n    <header> Feedback </header>\n    <iframe src=\"https://docs.google.com/a/mozilla.com/forms/d/1lVE7JyRo_tjakN0mLG1Cd9X9vseBX9wci153z9JcNEs/viewform?embedded=true\" width=\"400\" height=\"300\" frameborder=\"0\" marginheight=\"0\" marginwidth=\"0\">Loading form...</iframe>\n    <!-- <p><button class=\"togetherjs-modal-close\">Close</button></p> -->\n  </div>\n\n  <div style=\"display: none\">\n    <!-- This is when you join a session and the other person has already changed to another URL: -->\n    <div id=\"togetherjs-template-url-change\" class=\"togetherjs-modal\">\n      <header> Following to new URL... </header>\n      <section>\n        <div class=\"togetherjs-person\"></div>\n        Following\n        <span class=\"togetherjs-person-name\"></span>\n        to <a href=\"\" class=\"togetherjs-person-url togetherjs-person-url-title\"></a>\n      </section>\n    </div>\n\n    <!-- This is when someone invites you to their session: -->\n    <div id=\"togetherjs-template-invite\" class=\"togetherjs-chat-item\">\n      <div class=\"togetherjs-person\"></div>\n      <div>\n        <span class=\"togetherjs-person-name\"></span>\n        has invited <strong class=\"togetherjs-if-forEveryone\">anyone</strong>\n        <strong class=\"togetherjs-ifnot-forEveryone\">you</strong>\n        to <a href=\"\" data-togetherjs-subattr-href=\"href\" class=\"togetherjs-sub-hrefTitle\" target=\"_blank\"></a>\n      </div>\n    </div>\n\n  </div>\n\n  <!-- The pointer at the side of a window: -->\n  <div id=\"togetherjs-window-pointer-right\" style=\"display: none\"></div>\n  <div id=\"togetherjs-window-pointer-left\" style=\"display: none\"></div>\n\n  <!-- The element that overlaps the background of the page during a modal dialog: -->\n  <div id=\"togetherjs-modal-background\" style=\"display: none\"></div>\n\n  <!-- Some miscellaneous templates -->\n  <div style=\"display: none\">\n\n    <!-- This is the cursor: -->\n    <div id=\"togetherjs-template-cursor\" class=\"togetherjs-cursor togetherjs\">\n      <!-- Note: images/cursor.svg is a copy of this (for editing): -->\n      <!-- crossbrowser svg dropshadow http://demosthenes.info/blog/600/Creating-a-True-CrossBrowser-Drop-Shadow- -->\n      <svg version=\"1.1\" id=\"Layer_1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" x=\"0px\" y=\"0px\"\n      \t width=\"15px\" height=\"22.838px\" viewBox=\"96.344 146.692 15 22.838\" enable-background=\"new 96.344 146.692 15 22.838\"\n      \t xml:space=\"preserve\">\n      <path fill=\"#231F20\" d=\"M98.984,146.692c2.167,1.322,1.624,6.067,3.773,7.298c-0.072-0.488,2.512-0.931,3.097,0\n      \tc0.503,0.337,1.104-0.846,2.653,0.443c0.555,0.593,3.258,2.179,1.001,8.851c-0.446,1.316,2.854,0.135,1.169,2.619\n      \tc-3.748,5.521-9.455,2.787-9.062,1.746c1.06-2.809-6.889-4.885-4.97-9.896c0.834-2.559,2.898,0.653,2.923,0.29\n      \tc-0.434-1.07-2.608-5.541-2.923-6.985C96.587,150.793,95.342,147.033,98.984,146.692z\"/>\n      </svg>\n      <!-- <img class=\"togetherjs-cursor-img\" src=\"http://localhost:8080/togetherjs/images/cursor.svg\"> -->\n      <span class=\"togetherjs-cursor-container\">\n        <span class=\"togetherjs-cursor-name\"></span>\n        <span style=\"display:none\" class=\"togetherjs-cursor-typing\" id=\"togetherjs-cursor-typebox\">\n          <span class=\"togetherjs-typing-ellipse-one\">&#9679;</span><span class=\"togetherjs-typing-ellipse-two\">&#9679;</span><span class=\"togetherjs-typing-ellipse-three\">&#9679;</span>\n        </span>\n        <!-- Displayed when the cursor is below the screen: -->\n        <span class=\"togetherjs-cursor-down\">\n\n        </span>\n        <!-- Displayed when the cursor is above the screen: -->\n        <span class=\"togetherjs-cursor-up\">\n\n        </span>\n      </span>\n    </div>\n\n    <!-- This is the element that goes around focused form elements: -->\n    <div id=\"togetherjs-template-focus\">\n      <div class=\"togetherjs-focus togetherjs-person-bordercolor\"></div>\n    </div>\n\n    <!-- This is a click: -->\n    <div id=\"togetherjs-template-click\" class=\"togetherjs-click togetherjs\">\n    </div>\n  </div>\n</div>\n"),
        help: clean("<% /*\n  This is used to show the help when you type /help.  Used in\n  TogetherJS.localChatMessage().\n\n*/ %>\n/help : this message\n/test : run an automated/randomized test (or stop one that is in progress)\n  /test start N : run N times (instead of default 100)\n  /test show : show what kind of actions the random test would take (or stop showing)\n  /test describe : describe the possible actions (instead of showing them)\n/clear : clear the chat area\n/record : open up a recorder for the session\n/playback URL : play back a session that was recorded (it's up to you to figure out how to host it)\n  /playback local:NAME : play a locally saved log\n/savelogs NAME : save the currently recorded logs under NAME (recorder must be open)\n/baseurl : set a local baseUrl to load TogetherJS from, for debugging a development version of TogetherJS.\n/config : override some TogetherJS configuration parameters\n  /config VAR VALUE : set TogetherJS.config(\"VAR\", VALUE).  VALUE must be a legal Javascript/JSON literal.\n  /config clear : remove all overridden configuration\n"),
        walkthrough: clean("<!--\n    Any elements with .togetherjs-walkthrough-firsttime will only be\n    displayed on during the first-time experience.  Any elements with\n    .togetherjs-walkthrough-not-firsttime will only be displayed when\n    the walkthrough is accessed through the Help menu.\n\n    Note you *cannot* use <section class=\"togetherjs-walkthrough-slide\n    togetherjs-walkthrough-firsttime\">: the number of sections must be the\n    same regardless.\n  -->\n<div id=\"togetherjs-walkthrough\" class=\"togetherjs-modal togetherjs-modal-wide\">\n  <header>You're using <span class=\"togetherjs-tool-name\">TogetherJS</span>!<button class=\"togetherjs-close\"></button></header>\n\n  <div id=\"togetherjs-walkthrough-previous\"></div>\n  <div id=\"togetherjs-walkthrough-next\"></div>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <p class=\"togetherjs-walkthrough-main-image\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-intro.png\"></p>\n\t<p><span class=\"togetherjs-tool-name\">TogetherJS</span> is a service for your website that makes it easy to collaborate in real-time on: <strong class=\"togetherjs-site-name\">[site name]</strong></p>\n  </section>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <div class=\"togetherjs-walkthrough-firsttime\">\n      <div class=\"togetherjs-walkthrough-main-image\">\n        <div class=\"togetherjs-walkthrough-avatar-section\">\n          <div class=\"togetherjs-avatar-preview togetherjs-person togetherjs-person-self\"></div>\n          <div class=\"togetherjs-avatar-upload-input\"><input type=\"file\" class=\"togetherjs-upload-avatar\"></div>\n        </div>\n        <input class=\"togetherjs-self-name\" type=\"text\" placeholder=\"Enter your name\">\n        <div class=\"togetherjs-swatch togetherjs-person-bgcolor-self\"></div>\n        <div class=\"togetherjs-save-settings\">\n          <button class=\"togetherjs-avatar-save togetherjs-primary\">\n            <span id=\"togetherjs-avatar-when-unsaved\">Save</span>\n            <span id=\"togetherjs-avatar-when-saved\" style=\"display: none\">Saved!</span>\n          </button>\n        </div>\n      </div>\n      <p>Set up your avatar, name and user color above.  If you'd like to update it later, you can click your Profile button.</p>\n    </div>\n    <div class=\"togetherjs-walkthrough-not-firsttime\">\n      <p class=\"togetherjs-walkthrough-main-image\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-profile.png\"></p>\n      <p>Change your avatar, name and user color using the Profile button.</p>\n    </div>\n  </section>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <p class=\"togetherjs-walkthrough-main-image togetherjs-ifnot-creator\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-invite.png\">\n    </p>\n    <p class=\"togetherjs-ifnot-creator\">You can invite more friends to the session by sending the invite link in the <span class=\"togetherjs-tool-name\">TogetherJS</span> dock.</p>\n    <p class=\"togetherjs-walkthrough-main-image togetherjs-if-creator\">\n      <span class=\"togetherjs-walkthrough-sendlink\">\n        Copy and paste this link into IM or email to invite friends.\n      </span>\n      <input type=\"text\" class=\"togetherjs-share-link\">\n    </p>\n    <p class=\"togetherjs-if-creator\">Send the above link to a friend so they can join your session!  You can find this invite link on the <span class=\"togetherjs-tool-name\">TogetherJS</span> dock as well.</p>\n  </section>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <p class=\"togetherjs-walkthrough-main-image\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-participant.png\"></p>\n    <p>Friends who join your <span class=\"togetherjs-tool-name\">TogetherJS</span> session will appear here.  You can click their avatars to see more.</p>\n  </section>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <p class=\"togetherjs-walkthrough-main-image\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-chat.png\"></p>\n    <p>When your friends join you in your <span class=\"togetherjs-tool-name\">TogetherJS</span> session, you can chat with them here!</p>\n  </section>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <p class=\"togetherjs-walkthrough-main-image\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-rtc.png\"></p>\n    <p>If your browser supports it, click the microphone icon to begin a audio chat. Learn more about this experimental feature <a href=\"https://github.com/mozilla/togetherjs/wiki/About-Audio-Chat-and-WebRTC\" target=\"_blank\">here</a>.</p>\n  </section>\n\n  <section class=\"togetherjs-walkthrough-slide\">\n    <p class=\"togetherjs-walkthrough-main-image\"><img src=\"http://localhost:8080/togetherjs/images/walkthrough-images-logo.png\"></p>\n    <p>Alright, you're ready to use <span class=\"togetherjs-tool-name\">TogetherJS</span>. Now start collaborating on <strong class=\"togetherjs-site-name\">[site name]</strong>!</p>\n  </section>\n\n  <div style=\"display: none\">\n    <!-- There is one of these created for each slide: -->\n    <span id=\"togetherjs-template-walkthrough-slide-progress\" class=\"togetherjs-walkthrough-slide-progress\">&#9679;</span>\n  </div>\n  <section id=\"togetherjs-walkthrough-progress\">\n  </section>\n\n  <section class=\"togetherjs-buttons\">\n    <button class=\"togetherjs-primary togetherjs-dismiss\">I'm ready!</button>\n  </section>\n\n</div><!-- /.togetherjs-modal -->\n")
      };
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('peers',["util", "session", "storage", "require"], function (util, session, storage, require) {
      var peers = util.Module("peers");
      var assert = util.assert;
      var CHECK_ACTIVITY_INTERVAL = 10*1000; // Every 10 seconds see if someone has gone idle
      var IDLE_TIME = 3*60*1000; // Idle time is 3 minutes
      var TAB_IDLE_TIME = 2*60*1000; // When you tab away, after two minutes you'll say you are idle
      var BYE_TIME = 10*60*1000; // After 10 minutes of inactivity the person is considered to be "gone"
    
      var ui;
      require(["ui"], function (uiModule) {
        ui = uiModule;
      });
    
      var DEFAULT_NICKNAMES = [
        "Friendly Fox",
        "Brilliant Beaver",
        "Observant Owl",
        "Gregarious Giraffe",
        "Wild Wolf",
        "Silent Seal",
        "Wacky Whale",
        "Curious Cat",
        "Intelligent Iguana"
      ];
    
      var Peer = util.Class({
    
        isSelf: false,
    
        constructor: function (id, attrs) {
          attrs = attrs || {};
          assert(id);
          assert(! Peer.peers[id]);
          this.id = id;
          this.identityId = attrs.identityId || null;
          this.status = attrs.status || "live";
          this.idle = attrs.status || "active";
          this.name = attrs.name || null;
          this.avatar = attrs.avatar || null;
          this.color = attrs.color || "#00FF00";
          this.view = ui.PeerView(this);
          this.lastMessageDate = 0;
          this.following = attrs.following || false;
          Peer.peers[id] = this;
          var joined = attrs.joined || false;
          if (attrs.fromHelloMessage) {
            this.updateFromHello(attrs.fromHelloMessage);
            if (attrs.fromHelloMessage.type == "hello") {
              joined = true;
            }
          }
          peers.emit("new-peer", this);
          if (joined) {
            this.view.notifyJoined();
          }
          this.view.update();
        },
    
        repr: function () {
          return "Peer(" + JSON.stringify(this.id) + ")";
        },
    
        serialize: function () {
          return {
            id: this.id,
            status: this.status,
            idle: this.idle,
            url: this.url,
            hash: this.hash,
            title: this.title,
            identityId: this.identityId,
            rtcSupported: this.rtcSupported,
            name: this.name,
            avatar: this.avatar,
            color: this.color,
            following: this.following
          };
        },
    
        destroy: function () {
          this.view.destroy();
          delete Peer.peers[this.id];
        },
    
        updateMessageDate: function (msg) {
          if (this.idle == "inactive") {
            this.update({idle: "active"});
          }
          if (this.status == "bye") {
            this.unbye();
          }
          this.lastMessageDate = Date.now();
        },
    
        updateFromHello: function (msg) {
          var urlUpdated = false;
          var activeRTC = false;
          var identityUpdated = false;
          if (msg.url && msg.url != this.url) {
            this.url = msg.url;
            this.hash = null;
            this.title = null;
            urlUpdated = true;
          }
          if (msg.hash != this.hash) {
            this.hash = msg.urlHash;
            urlUpdated = true;
          }
          if (msg.title != this.title) {
            this.title = msg.title;
            urlUpdated = true;
          }
          if (msg.rtcSupported !== undefined) {
            this.rtcSupported = msg.rtcSupported;
          }
          if (msg.identityId !== undefined) {
            this.identityId = msg.identityId;
          }
          if (msg.name && msg.name != this.name) {
            this.name = msg.name;
            identityUpdated = true;
          }
          if (msg.avatar && msg.avatar != this.avatar) {
            util.assertValidUrl(msg.avatar);
            this.avatar = msg.avatar;
            identityUpdated = true;
          }
          if (msg.color && msg.color != this.color) {
            this.color = msg.color;
            identityUpdated = true;
          }
          if (msg.isClient !== undefined) {
            this.isCreator = ! msg.isClient;
          }
          if (this.status != "live") {
            this.status = "live";
            peers.emit("status-updated", this);
          }
          if (this.idle != "active") {
            this.idle = "active";
            peers.emit("idle-updated", this);
          }
          if (msg.rtcSupported) {
            peers.emit("rtc-supported", this);
          }
          if (urlUpdated) {
            peers.emit("url-updated", this);
          }
          if (identityUpdated) {
            peers.emit("identity-updated", this);
          }
          // FIXME: I can't decide if this is the only time we need to emit
          // this message (and not .update() or other methods)
          if (this.following) {
            session.emit("follow-peer", this);
          }
        },
    
        update: function (attrs) {
          // FIXME: should probably test that only a couple attributes are settable
          // particularly status and idle
          if (attrs.idle) {
            this.idle = attrs.idle;
          }
          if (attrs.status) {
            this.status = attrs.status;
          }
          this.view.update();
        },
    
        className: function (prefix) {
          prefix = prefix || "";
          return prefix + util.safeClassName(this.id);
        },
    
        bye: function () {
          if (this.status != "bye") {
            this.status = "bye";
            peers.emit("status-updated", this);
          }
          this.view.update();
        },
    
        unbye: function () {
          if (this.status == "bye") {
            this.status = "live";
            peers.emit("status-updated", this);
          }
          this.view.update();
        },
    
        nudge: function () {
          session.send({
            type: "url-change-nudge",
            url: location.href,
            to: this.id
          });
        },
    
        follow: function () {
          if (this.following) {
            return;
          }
          peers.getAllPeers().forEach(function (p) {
            if (p.following) {
              p.unfollow();
            }
          });
          this.following = true;
          // We have to make sure we remember this, even if we change URLs:
          storeSerialization();
          this.view.update();
          session.emit("follow-peer", this);
        },
    
        unfollow: function () {
          this.following = false;
          storeSerialization();
          this.view.update();
        }
    
      });
    
      // FIXME: I can't decide where this should actually go, seems weird
      // that it is emitted and handled in the same module
      session.on("follow-peer", function (peer) {
        if (peer.url != session.currentUrl()) {
          var url = peer.url;
          if (peer.urlHash) {
            url += peer.urlHash;
          }
          location.href = url;
        }
      });
    
      Peer.peers = {};
    
      Peer.deserialize = function (obj) {
        obj.fromStorage = true;
        var peer = Peer(obj.id, obj);
      };
    
      peers.Self = undefined;
    
      session.on("start", function () {
        if (peers.Self) {
          return;
        }
        /* Same interface as Peer, represents oneself (local user): */
        peers.Self = util.mixinEvents({
          isSelf: true,
          id: session.clientId,
          identityId: session.identityId,
          status: "live",
          idle: "active",
          name: null,
          avatar: null,
          color: null,
          defaultName: null,
          loaded: false,
          isCreator: ! session.isClient,
    
          updateFromHello: function (msg) {
            var urlUpdated = false;
            var activeRTC = false;
            var identityUpdated = false;
            if (msg.url && msg.url != this.url) {
              this.url = msg.url;
              this.hash = null;
              this.title = null;
              urlUpdated = true;
            }
            if (msg.hash != this.hash) {
              this.hash = msg.urlHash;
              urlUpdated = true;
            }
            if (msg.title != this.title) {
              this.title = msg.title;
              urlUpdated = true;
            }
            if (msg.rtcSupported !== undefined) {
              this.rtcSupported = msg.rtcSupported;
            }
            if (msg.identityId !== undefined) {
              this.identityId = msg.identityId;
            }
            if (msg.name && msg.name != this.name) {
              this.name = msg.name;
              identityUpdated = true;
            }
            if (msg.avatar && msg.avatar != this.avatar) {
              util.assertValidUrl(msg.avatar);
              this.avatar = msg.avatar;
              identityUpdated = true;
            }
            if (msg.color && msg.color != this.color) {
              this.color = msg.color;
              identityUpdated = true;
            }
            if (msg.isClient !== undefined) {
              this.isCreator = ! msg.isClient;
            }
            if (this.status != "live") {
              this.status = "live";
              peers.emit("status-updated", this);
            }
            if (this.idle != "active") {
              this.idle = "active";
              peers.emit("idle-updated", this);
            }
            if (msg.rtcSupported) {
              peers.emit("rtc-supported", this);
            }
            if (urlUpdated) {
              peers.emit("url-updated", this);
            }
            if (identityUpdated) {
              peers.emit("identity-updated", this);
            }
            // FIXME: I can't decide if this is the only time we need to emit
            // this message (and not .update() or other methods)
            if (this.following) {
              session.emit("follow-peer", this);
            }
          },
    
          update: function (attrs) {
            var updatePeers = false;
            var updateIdle = false;
            var updateMsg = {type: "peer-update"};
            if (typeof attrs.name == "string" && attrs.name != this.name) {
              this.name = attrs.name;
              updateMsg.name = this.name;
              if (! attrs.fromLoad) {
                storage.settings.set("name", this.name);
                updatePeers = true;
              }
            }
            if (attrs.avatar && attrs.avatar != this.avatar) {
              util.assertValidUrl(attrs.avatar);
              this.avatar = attrs.avatar;
              updateMsg.avatar = this.avatar;
              if (! attrs.fromLoad) {
                storage.settings.set("avatar", this.avatar);
                updatePeers = true;
              }
            }
            if (attrs.color && attrs.color != this.color) {
              this.color = attrs.color;
              updateMsg.color = this.color;
              if (! attrs.fromLoad) {
                storage.settings.set("color", this.color);
                updatePeers = true;
              }
            }
            if (attrs.defaultName && attrs.defaultName != this.defaultName) {
              this.defaultName = attrs.defaultName;
              if (! attrs.fromLoad) {
                storage.settings.set("defaultName", this.defaultName);
                updatePeers = true;
              }
            }
            if (attrs.status && attrs.status != this.status) {
              this.status = attrs.status;
              peers.emit("status-updated", this);
            }
            if (attrs.idle && attrs.idle != this.idle) {
              this.idle = attrs.idle;
              updateIdle = true;
              peers.emit("idle-updated", this);
            }
            this.view.update();
            if (updatePeers && ! attrs.fromLoad) {
              session.emit("self-updated");
              session.send(updateMsg);
            }
            if (updateIdle && ! attrs.fromLoad) {
              session.send({
                type: "idle-status",
                idle: this.idle
              });
            }
          },
    
          className: function (prefix) {
            prefix = prefix || "";
            return prefix + "self";
          },
    
          _loadFromSettings: function () {
            return util.resolveMany(
              storage.settings.get("name"),
              storage.settings.get("avatar"),
              storage.settings.get("defaultName"),
              storage.settings.get("color")).then((function (name, avatar, defaultName, color) {
                if (! defaultName) {
                  defaultName = util.pickRandom(DEFAULT_NICKNAMES);
                  storage.settings.set("defaultName", defaultName);
                }
                if (! color) {
                  color = Math.floor(Math.random() * 0xffffff).toString(16);
                  while (color.length < 6) {
                    color = "0" + color;
                  }
                  color = "#" + color;
                  storage.settings.set("color", color);
                }
                if (! avatar) {
                  avatar = TogetherJS.baseUrl + "/togetherjs/images/default-avatar.png";
                }
                this.update({
                  name: name,
                  avatar: avatar,
                  defaultName: defaultName,
                  color: color,
                  fromLoad: true
                });
                peers._SelfLoaded.resolve();
              }).bind(this)); // FIXME: ignoring error
          },
    
          _loadFromApp: function () {
            // FIXME: I wonder if these should be optionally functions?
            // We could test typeof==function to distinguish between a getter and a concrete value
            var getUserName = TogetherJS.config.get("getUserName");
            var getUserColor = TogetherJS.config.get("getUserColor");
            var getUserAvatar = TogetherJS.config.get("getUserAvatar");
            var name, color, avatar;
            if (getUserName) {
              if (typeof getUserName == "string") {
                name = getUserName;
              } else {
                name = getUserName();
              }
              if (name && typeof name != "string") {
                // FIXME: test for HTML safe?  Not that we require it, but
                // <>'s are probably a sign something is wrong.
                console.warn("Error in getUserName(): should return a string (got", name, ")");
                name = null;
              }
            }
            if (getUserColor) {
              if (typeof getUserColor == "string") {
                color = getUserColor;
              } else {
                color = getUserColor();
              }
              if (color && typeof color != "string") {
                // FIXME: would be nice to test for color-ness here.
                console.warn("Error in getUserColor(): should return a string (got", color, ")");
                color = null;
              }
            }
            if (getUserAvatar) {
              if (typeof getUserAvatar == "string") {
                avatar = getUserAvatar;
              } else {
                avatar = getUserAvatar();
              }
              if (avatar && typeof avatar != "string") {
                console.warn("Error in getUserAvatar(): should return a string (got", avatar, ")");
                avatar = null;
              }
            }
            if (name || color || avatar) {
              this.update({
                name: name,
                color: color,
                avatar: avatar
              });
            }
          }
        });
    
        peers.Self.view = ui.PeerView(peers.Self);
        storage.tab.get("peerCache").then(deserialize);
        peers.Self._loadFromSettings().then(function() {
          peers.Self._loadFromApp();
          peers.Self.view.update();
          session.emit("self-updated");
        });
      });
    
      session.on("refresh-user-data", function () {
        if (peers.Self) {
          peers.Self._loadFromApp();
        }
      });
    
      TogetherJS.config.track(
        "getUserName",
        TogetherJS.config.track(
          "getUserColor",
          TogetherJS.config.track(
            "getUserAvatar",
            function () {
              if (peers.Self) {
                peers.Self._loadFromApp();
              }
            }
          )
        )
      );
    
      peers._SelfLoaded = util.Deferred();
    
      function serialize() {
        var peers = [];
        util.forEachAttr(Peer.peers, function (peer) {
          peers.push(peer.serialize());
        });
        return {
          peers: peers
        };
      }
    
      function deserialize(obj) {
        if (! obj) {
          return;
        }
        obj.peers.forEach(function (peer) {
          Peer.deserialize(peer);
        });
      }
    
      peers.getPeer = function getPeer(id, message) {
        assert(id);
        var peer = Peer.peers[id];
        if (id === session.clientId) {
          return peers.Self;
        }
        if (message && ! peer) {
          peer = Peer(id, {fromHelloMessage: message});
          return peer;
        }
        assert(peer, "No peer with id:", id);
        if (message &&
            (message.type == "hello" || message.type == "hello-back" ||
             message.type == "peer-update")) {
          peer.updateFromHello(message);
          peer.view.update();
        }
        return Peer.peers[id];
      };
    
      peers.getAllPeers = function (liveOnly) {
        var result = [];
        util.forEachAttr(Peer.peers, function (peer) {
          if (liveOnly && peer.status != "live") {
            return;
          }
          result.push(peer);
        });
        return result;
      };
    
      function checkActivity() {
        var ps = peers.getAllPeers();
        var now = Date.now();
        ps.forEach(function (p) {
          if (p.idle == "active" && now - p.lastMessageDate > IDLE_TIME) {
            p.update({idle: "inactive"});
          }
          if (p.status != "bye" && now - p.lastMessageDate > BYE_TIME) {
            p.bye();
          }
        });
      }
    
      session.hub.on("bye", function (msg) {
        var peer = peers.getPeer(msg.clientId);
        peer.bye();
      });
    
      var checkActivityTask = null;
    
      session.on("start", function () {
        if (checkActivityTask) {
          console.warn("Old peers checkActivityTask left over?");
          clearTimeout(checkActivityTask);
        }
        checkActivityTask = setInterval(checkActivity, CHECK_ACTIVITY_INTERVAL);
      });
    
      session.on("close", function () {
        util.forEachAttr(Peer.peers, function (peer) {
          peer.destroy();
        });
        storage.tab.set("peerCache", undefined);
        clearTimeout(checkActivityTask);
        checkActivityTask = null;
      });
    
      var tabIdleTimeout = null;
    
      session.on("visibility-change", function (hidden) {
        if (hidden) {
          if (tabIdleTimeout) {
            clearTimeout(tabIdleTimeout);
          }
          tabIdleTimeout = setTimeout(function () {
            peers.Self.update({idle: "inactive"});
          }, TAB_IDLE_TIME);
        } else {
          if (tabIdleTimeout) {
            clearTimeout(tabIdleTimeout);
          }
          if (peers.Self.idle == "inactive") {
            peers.Self.update({idle: "active"});
          }
        }
      });
    
      session.hub.on("idle-status", function (msg) {
        msg.peer.update({idle: msg.idle});
      });
    
      // Pings are a straight alive check, and contain no more information:
      session.hub.on("ping", function () {
        session.send({type: "ping-back"});
      });
    
      window.addEventListener("pagehide", function () {
        // FIXME: not certain if this should be tab local or not:
        storeSerialization();
      }, false);
    
      function storeSerialization() {
        storage.tab.set("peerCache", serialize());
      }
    
      util.mixinEvents(peers);
    
      util.testExpose({
        setIdleTime: function (time) {
          IDLE_TIME = time;
          CHECK_ACTIVITY_INTERVAL = time / 2;
          if (TogetherJS.running) {
            clearTimeout(checkActivityTask);
            checkActivityTask = setInterval(checkActivity, CHECK_ACTIVITY_INTERVAL);
          }
        }
      });
    
      util.testExpose({
        setByeTime: function (time) {
          BYE_TIME = time;
          CHECK_ACTIVITY_INTERVAL = Math.min(CHECK_ACTIVITY_INTERVAL, time / 2);
          if (TogetherJS.running) {
            clearTimeout(checkActivityTask);
            checkActivityTask = setInterval(checkActivity, CHECK_ACTIVITY_INTERVAL);
          }
        }
      });
    
      return peers;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    define('windowing',["jquery", "util", "peers", "session"], function ($, util, peers, session) {
      var assert = util.assert;
      var windowing = util.Module("windowing");
      var $window = $(window);
      // This is also in togetherjs.less, under .togetherjs-animated
      var ANIMATION_DURATION = 1000;
    
      /* Displays one window.  A window must already exist.  This hides other windows, and
         positions the window according to its data-bound-to attributes */
      windowing.show = function (element, options) {
        element = $(element);
        options = options || {};
        options.bind = options.bind || element.attr("data-bind-to");
        var notification = element.hasClass("togetherjs-notification");
        var modal = element.hasClass("togetherjs-modal");
        if (options.bind) {
          options.bind = $(options.bind);
        }
        windowing.hide();
        element.stop();
        element.show();
        // In addition to being hidden, the window can be faded out, which we want to undo:
        element.css({opacity: "1"});
        if (options.bind) {
          assert(! modal, "Binding does not currently work with modals");
          bind(element, options.bind);
        }
        if (notification) {
          element.slideIn();
        } else if (! modal) {
          element.popinWindow();
        }
        if (modal) {
          getModalBackground().show();
          modalEscape.bind();
        }
        onClose = options.onClose || null;
        session.emit("display-window", element.attr("id"), element);
      };
    
      var onClose = null;
    
      /* Moves a window to be attached to data-bind-to, e.g., the button
         that opened the window. Or you can provide an element that it should bind to. */
      function bind(win, bound) {
        if ($.browser.mobile) {
          return;
        }
        win = $(win);
        assert(bound.length, "Cannot find binding:", bound.selector, "from:", win.selector);
        const ifacePos = require("ui").panelPosition()
        var boundPos = bound.offset();
        boundPos.height = bound.height();
        boundPos.width = bound.width();
        boundPos.top -= $window.scrollTop();
        boundPos.left -= $window.scrollLeft();
        // FIXME: I appear to have to add the padding to the width to get a "true"
        // width.  But it's still not entirely consistent.
        var height = win.height() + 5;
        var width = win.width() + 20;
        var left, top;
        if (ifacePos == "left") {
          left = boundPos.left + boundPos.width + 15;
          top = boundPos.top + (boundPos.height / 2) - (height / 2);
        } else if (ifacePos == "right") {
          left = boundPos.left - 11 - width;
          top = boundPos.top + (boundPos.height / 2) - (height / 2);
        } else if (ifacePos == "top") {
          left = (boundPos.left + boundPos.width / 2) - (width / 2);
          top = boundPos.top + boundPos.width + 15;
        } else {
          left = (boundPos.left + boundPos.width / 2) - (width / 2);
          top = boundPos.top - 10 - height;
        }
        win.css({
          left: left + "px",
          right: "",
          top: top + "px",
          bottom: ""
        });
        if (parseInt(win.css("left")) < 5)
          win.css({
            left: "5px"
          })
        else if (parseInt(win.css("right")) < 5)
          win.css({
            left: "",
            right: "5px"
          })
        if (parseInt(win.css("top")) < 5)
          win.css({
            top: "5px"
          })
        else if (parseInt(win.css("bottom")) < 5)
          win.css({
            top: "",
            bottom: "5px"
          })
        if (win.hasClass("togetherjs-window")) {
          $("#togetherjs-window-pointer").hide();
          var pointer = $("#togetherjs-window-pointer")
          pointer.removeClass()
          pointer.addClass(ifacePos)
          pointer.show();
          if (ifacePos == "left") {
            pointer.css({
              left: (left - 30) + "px",
              top: (boundPos.top + Math.floor(boundPos.height / 2) - 13) + "px"
            });
          } else if (ifacePos == "right") {
            pointer.css({
              left: (left + win.width() + 14) + "px",
              top: (boundPos.top + Math.floor(boundPos.height / 2) - 13) + "px"
            });
          } else if (ifacePos == "top") {
            pointer.css({
              left: (boundPos.left + Math.floor(boundPos.width / 2) - 13) + "px",
              top: (top - 30) + "px"
            });
          } else if (ifacePos == "bottom") {
            pointer.css({
              left: (boundPos.left + Math.floor(boundPos.width / 2) - 13) + "px",
              top: (top + win.height()) + "px"
            });
          }
        }
        win.data("boundTo", bound.selector || "#" + bound.attr("id"));
        bound.addClass("togetherjs-active");
      }
    
      session.on("resize", function () {
        var win = $(".togetherjs-modal:visible, .togetherjs-window:visible");
        if (! win.length) {
          return;
        }
        var boundTo = win.data("boundTo");
        if (! boundTo) {
          return;
        }
        boundTo = $(boundTo);
        bind(win, boundTo);
      });
    
      windowing.hide = function (els) {
        // FIXME: also hide modals?
        els = els || ".togetherjs-window, .togetherjs-modal, .togetherjs-notification";
        els = $(els);
        els = els.filter(":visible");
        els.filter(":not(.togetherjs-notification)").hide();
        getModalBackground().hide();
        var windows = [];
        els.each(function (index, element) {
          element = $(element);
          windows.push(element);
          var bound = element.data("boundTo");
          if (! bound) {
            return;
          }
          bound = $(bound);
          bound.addClass("togetherjs-animated").addClass("togetherjs-color-pulse");
          setTimeout(function () {
            bound.removeClass("togetherjs-color-pulse").removeClass("togetherjs-animated");
          }, ANIMATION_DURATION+10);
          element.data("boundTo", null);
          bound.removeClass("togetherjs-active");
          if (element.hasClass("togetherjs-notification")) {
            element.fadeOut().promise().then(function () {
              this.hide();
            });
          }
        });
        $("#togetherjs-window-pointer").hide();
        if (onClose) {
          onClose();
          onClose = null;
        }
        if (windows.length) {
          session.emit("hide-window", windows);
        }
      };
    
      windowing.showNotification = function (element, options) {
        element = $(element);
        options = options || {};
        assert(false);
      };
    
      windowing.toggle = function (el) {
        el = $(el);
        if (el.is(":visible")) {
          windowing.hide(el);
        } else {
          windowing.show(el);
        }
      };
    
      function bindEvents(el) {
        el.find(".togetherjs-close, .togetherjs-dismiss").click(function (event) {
          var w = $(event.target).closest(".togetherjs-window, .togetherjs-modal, .togetherjs-notification");
          windowing.hide(w);
          event.stopPropagation();
          return false;
        });
      }
    
      function getModalBackground() {
        if (getModalBackground.element) {
          return getModalBackground.element;
        }
        var background = $("#togetherjs-modal-background");
        assert(background.length);
        getModalBackground.element = background;
        background.click(function () {
          windowing.hide();
        });
        return background;
      }
    
      var modalEscape = {
        bind: function () {
          $(document).keydown(modalEscape.onKeydown);
        },
        unbind: function () {
          $(document).unbind("keydown", modalEscape.onKeydown);
        },
        onKeydown: function (event) {
          if (event.which == 27) {
            windowing.hide();
          }
        }
      };
    
      session.on("close", function () {
        modalEscape.unbind();
      });
    
      session.on("new-element", function (el) {
        bindEvents(el);
      });
    
      return windowing;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    define('templating',["jquery", "util", "peers", "windowing", "session"], function ($, util, peers, windowing, session) {
      var assert = util.assert;
      var templating = util.Module("templating");
    
      templating.clone = function (templateId) {
        templateId = "#togetherjs-template-" + templateId;
        var template = $(templateId);
        assert(template.length, "No template found with id:", templateId);
        template = template.clone();
        template.attr("id", null);
        // FIXME: if called directly, doesn't emit new-element event:
        return template;
      };
    
      templating.sub = function (templateId, variables) {
        var template = templating.clone(templateId);
        variables = variables || {};
        util.forEachAttr(variables, function (value, attr) {
          // FIXME: do the substitution... somehow?
          var subs = template.find(".togetherjs-sub-" + attr).removeClass("togetherjs-sub-" + attr);
          if (subs.length) {
            if (typeof value == "string") {
              subs.text(value);
            } else if (value instanceof $) {
              subs.append(value);
            } else {
              assert(false, "Unknown variable value type:", attr, "=", value);
            }
          }
          var ifs = template.find(".togetherjs-if-" + attr).removeClass("togetherjs-sub-" + attr);
          if (! value) {
            ifs.hide();
          }
          ifs = template.find(".togetherjs-ifnot-" + attr).removeClass("togetherjs-ifnot-" + attr);
          if (value) {
            ifs.hide();
          }
          var attrName = "data-togetherjs-subattr-" + attr;
          var attrs = template.find("[" + attrName + "]");
          attrs.each(function (index, element) {
            assert(typeof value == "string");
            element = $(element);
            var subAttribute = element.attr(attrName);
            element.attr(attrName, null);
            element.attr(subAttribute, value);
          });
        });
        if (variables.peer) {
          variables.peer.view.setElement(template);
        }
        if (variables.date) {
          var date = variables.date;
          if (typeof date == "number") {
            date = new Date(date);
          }
          var ampm = "AM";
          var hour = date.getHours();
          if (hour > 12) {
            hour -= 12;
            ampm = "PM";
          }
          var minute = date.getMinutes();
          var t = hour + ":";
          if (minute < 10) {
            t += "0";
          }
          t += minute;
          template.find(".togetherjs-time").text(t);
          template.find(".togetherjs-ampm").text(ampm);
        }
    
        // FIXME: silly this is on session:
        session.emit("new-element", template);
        return template;
      };
    
      return templating;
    });
    
    define('linkify',[], function () {
      // FIXME: this could be moved to a different module, it's pretty stand-alone
      /* Finds any links in the text of an element (or its children) and turns them
         into anchors (with target=_blank) */
      function linkify(el) {
        if (el.jquery) {
          el = el[0];
        }
        el.normalize();
        function linkifyNode(node) {
          var _len = node.childNodes.length;
          for (var i=0; i<_len; i++) {
            if (node.childNodes[i].nodeType == document.ELEMENT_NODE) {
              linkifyNode(node.childNodes[i]);
            }
          }
          var texts = [];
          for (i=0; i<_len; i++) {
            if (node.childNodes[i].nodeType == document.TEXT_NODE) {
              texts.push(node.childNodes[i]);
            }
          }
          texts.forEach(function (item) {
            if (item.nodeType == document.ELEMENT_NODE) {
              linkifyNode(item);
            } else if (item.nodeType == document.TEXT_NODE) {
              while (true) {
                var text = item.nodeValue;
                var regex = /\bhttps?:\/\/[a-z0-9\.\-_](:\d+)?[^ \n\t<>()\[\]]*/i;
                var match = regex.exec(text);
                if (! match) {
                  break;
                }
                var leadingNode = document.createTextNode(text.substr(0, match.index));
                node.replaceChild(leadingNode, item);
                var anchor = document.createElement("a");
                anchor.setAttribute("target", "_blank");
                anchor.href = match[0];
                anchor.appendChild(document.createTextNode(match[0]));
                node.insertBefore(anchor, leadingNode.nextSibling);
                var trailing = document.createTextNode(text.substr(match.index + match[0].length));
                node.insertBefore(trailing, anchor.nextSibling);
                item = trailing;
              }
            }
          });
        }
        linkifyNode(el);
        return el;
      }
    
      return linkify;
    });
    
    // TinyColor v0.9.13
    // https://github.com/bgrins/TinyColor
    // 2012-11-28, Brian Grinstead, MIT License
    
    (function(root) {
    
    var trimLeft = /^[\s,#]+/,
        trimRight = /\s+$/,
        tinyCounter = 0,
        math = Math,
        mathRound = math.round,
        mathMin = math.min,
        mathMax = math.max,
        mathRandom = math.random;
    
    function tinycolor (color, opts) {
    
        color = (color) ? color : '';
    
        // If input is already a tinycolor, return itself
        if (typeof color == "object" && color.hasOwnProperty("_tc_id")) {
           return color;
        }
    
        var rgb = inputToRGB(color);
        var r = rgb.r,
            g = rgb.g,
            b = rgb.b,
            a = rgb.a,
            roundA = mathRound(100*a) / 100,
            format = rgb.format;
    
        // Don't let the range of [0,255] come back in [0,1].
        // Potentially lose a little bit of precision here, but will fix issues where
        // .5 gets interpreted as half of the total, instead of half of 1
        // If it was supposed to be 128, this was already taken care of by `inputToRgb`
        if (r < 1) { r = mathRound(r); }
        if (g < 1) { g = mathRound(g); }
        if (b < 1) { b = mathRound(b); }
    
        return {
            ok: rgb.ok,
            format: format,
            _tc_id: tinyCounter++,
            alpha: a,
            toHsv: function() {
                var hsv = rgbToHsv(r, g, b);
                return { h: hsv.h * 360, s: hsv.s, v: hsv.v, a: a };
            },
            toHsvString: function() {
                var hsv = rgbToHsv(r, g, b);
                var h = mathRound(hsv.h * 360), s = mathRound(hsv.s * 100), v = mathRound(hsv.v * 100);
                return (a == 1) ?
                  "hsv("  + h + ", " + s + "%, " + v + "%)" :
                  "hsva(" + h + ", " + s + "%, " + v + "%, "+ roundA + ")";
            },
            toHsl: function() {
                var hsl = rgbToHsl(r, g, b);
                return { h: hsl.h * 360, s: hsl.s, l: hsl.l, a: a };
            },
            toHslString: function() {
                var hsl = rgbToHsl(r, g, b);
                var h = mathRound(hsl.h * 360), s = mathRound(hsl.s * 100), l = mathRound(hsl.l * 100);
                return (a == 1) ?
                  "hsl("  + h + ", " + s + "%, " + l + "%)" :
                  "hsla(" + h + ", " + s + "%, " + l + "%, "+ roundA + ")";
            },
            toHex: function() {
                return rgbToHex(r, g, b);
            },
            toHexString: function() {
                return '#' + rgbToHex(r, g, b);
            },
            toRgb: function() {
                return { r: mathRound(r), g: mathRound(g), b: mathRound(b), a: a };
            },
            toRgbString: function() {
                return (a == 1) ?
                  "rgb("  + mathRound(r) + ", " + mathRound(g) + ", " + mathRound(b) + ")" :
                  "rgba(" + mathRound(r) + ", " + mathRound(g) + ", " + mathRound(b) + ", " + roundA + ")";
            },
            toPercentageRgb: function() {
                return { r: mathRound(bound01(r, 255) * 100) + "%", g: mathRound(bound01(g, 255) * 100) + "%", b: mathRound(bound01(b, 255) * 100) + "%", a: a };
            },
            toPercentageRgbString: function() {
                return (a == 1) ?
                  "rgb("  + mathRound(bound01(r, 255) * 100) + "%, " + mathRound(bound01(g, 255) * 100) + "%, " + mathRound(bound01(b, 255) * 100) + "%)" :
                  "rgba(" + mathRound(bound01(r, 255) * 100) + "%, " + mathRound(bound01(g, 255) * 100) + "%, " + mathRound(bound01(b, 255) * 100) + "%, " + roundA + ")";
            },
            toName: function() {
                return hexNames[rgbToHex(r, g, b)] || false;
            },
            toFilter: function() {
                var hex = rgbToHex(r, g, b);
                var secondHex = hex;
                var alphaHex = Math.round(parseFloat(a) * 255).toString(16);
                var secondAlphaHex = alphaHex;
                var gradientType = opts && opts.gradientType ? "GradientType = 1, " : "";
    
                if (secondColor) {
                    var s = tinycolor(secondColor);
                    secondHex = s.toHex();
                    secondAlphaHex = Math.round(parseFloat(s.alpha) * 255).toString(16);
                }
    
                return "progid:DXImageTransform.Microsoft.gradient("+gradientType+"startColorstr=#" + pad2(alphaHex) + hex + ",endColorstr=#" + pad2(secondAlphaHex) + secondHex + ")";
            },
            toString: function(format) {
                format = format || this.format;
                var formattedString = false;
                if (format === "rgb") {
                    formattedString = this.toRgbString();
                }
                if (format === "prgb") {
                    formattedString = this.toPercentageRgbString();
                }
                if (format === "hex") {
                    formattedString = this.toHexString();
                }
                if (format === "name") {
                    formattedString = this.toName();
                }
                if (format === "hsl") {
                    formattedString = this.toHslString();
                }
                if (format === "hsv") {
                    formattedString = this.toHsvString();
                }
    
                return formattedString || this.toHexString();
            }
        };
    }
    
    // If input is an object, force 1 into "1.0" to handle ratios properly
    // String input requires "1.0" as input, so 1 will be treated as 1
    tinycolor.fromRatio = function(color) {
        if (typeof color == "object") {
            var newColor = {};
            for (var i in color) {
                newColor[i] = convertToPercentage(color[i]);
            }
            color = newColor;
        }
    
        return tinycolor(color);
    };
    
    // Given a string or object, convert that input to RGB
    // Possible string inputs:
    //
    //     "red"
    //     "#f00" or "f00"
    //     "#ff0000" or "ff0000"
    //     "rgb 255 0 0" or "rgb (255, 0, 0)"
    //     "rgb 1.0 0 0" or "rgb (1, 0, 0)"
    //     "rgba (255, 0, 0, 1)" or "rgba 255, 0, 0, 1"
    //     "rgba (1.0, 0, 0, 1)" or "rgba 1.0, 0, 0, 1"
    //     "hsl(0, 100%, 50%)" or "hsl 0 100% 50%"
    //     "hsla(0, 100%, 50%, 1)" or "hsla 0 100% 50%, 1"
    //     "hsv(0, 100%, 100%)" or "hsv 0 100% 100%"
    //
    function inputToRGB(color) {
    
        var rgb = { r: 255, g: 255, b: 255 };
        var a = 1;
        var ok = false;
        var format = false;
    
        if (typeof color == "string") {
            color = stringInputToObject(color);
        }
    
        if (typeof color == "object") {
            if (color.hasOwnProperty("r") && color.hasOwnProperty("g") && color.hasOwnProperty("b")) {
                rgb = rgbToRgb(color.r, color.g, color.b);
                ok = true;
                format = String(color.r).substr(-1) === "%" ? "prgb" : "rgb";
            }
            else if (color.hasOwnProperty("h") && color.hasOwnProperty("s") && color.hasOwnProperty("v")) {
                color.s = convertToPercentage(color.s);
                color.v = convertToPercentage(color.v);
                rgb = hsvToRgb(color.h, color.s, color.v);
                ok = true;
                format = "hsv";
            }
            else if (color.hasOwnProperty("h") && color.hasOwnProperty("s") && color.hasOwnProperty("l")) {
                color.s = convertToPercentage(color.s);
                color.l = convertToPercentage(color.l);
                rgb = hslToRgb(color.h, color.s, color.l);
                ok = true;
                format = "hsl";
            }
    
            if (color.hasOwnProperty("a")) {
                a = color.a;
            }
        }
    
        a = parseFloat(a);
    
        // Handle invalid alpha characters by setting to 1
        if (isNaN(a) || a < 0 || a > 1) {
            a = 1;
        }
    
        return {
            ok: ok,
            format: color.format || format,
            r: mathMin(255, mathMax(rgb.r, 0)),
            g: mathMin(255, mathMax(rgb.g, 0)),
            b: mathMin(255, mathMax(rgb.b, 0)),
            a: a
        };
    }
    
    
    
    // Conversion Functions
    // --------------------
    
    // `rgbToHsl`, `rgbToHsv`, `hslToRgb`, `hsvToRgb` modified from:
    // <http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript>
    
    // `rgbToRgb`
    // Handle bounds / percentage checking to conform to CSS color spec
    // <http://www.w3.org/TR/css3-color/>
    // *Assumes:* r, g, b in [0, 255] or [0, 1]
    // *Returns:* { r, g, b } in [0, 255]
    function rgbToRgb(r, g, b){
        return {
            r: bound01(r, 255) * 255,
            g: bound01(g, 255) * 255,
            b: bound01(b, 255) * 255
        };
    }
    
    // `rgbToHsl`
    // Converts an RGB color value to HSL.
    // *Assumes:* r, g, and b are contained in [0, 255] or [0, 1]
    // *Returns:* { h, s, l } in [0,1]
    function rgbToHsl(r, g, b) {
    
        r = bound01(r, 255);
        g = bound01(g, 255);
        b = bound01(b, 255);
    
        var max = mathMax(r, g, b), min = mathMin(r, g, b);
        var h, s, l = (max + min) / 2;
    
        if(max == min) {
            h = s = 0; // achromatic
        }
        else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
    
            h /= 6;
        }
    
        return { h: h, s: s, l: l };
    }
    
    // `hslToRgb`
    // Converts an HSL color value to RGB.
    // *Assumes:* h is contained in [0, 1] or [0, 360] and s and l are contained [0, 1] or [0, 100]
    // *Returns:* { r, g, b } in the set [0, 255]
    function hslToRgb(h, s, l) {
        var r, g, b;
    
        h = bound01(h, 360);
        s = bound01(s, 100);
        l = bound01(l, 100);
    
        function hue2rgb(p, q, t) {
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
    
        if(s === 0) {
            r = g = b = l; // achromatic
        }
        else {
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
    
        return { r: r * 255, g: g * 255, b: b * 255 };
    }
    
    // `rgbToHsv`
    // Converts an RGB color value to HSV
    // *Assumes:* r, g, and b are contained in the set [0, 255] or [0, 1]
    // *Returns:* { h, s, v } in [0,1]
    function rgbToHsv(r, g, b) {
    
        r = bound01(r, 255);
        g = bound01(g, 255);
        b = bound01(b, 255);
    
        var max = mathMax(r, g, b), min = mathMin(r, g, b);
        var h, s, v = max;
    
        var d = max - min;
        s = max === 0 ? 0 : d / max;
    
        if(max == min) {
            h = 0; // achromatic
        }
        else {
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h, s: s, v: v };
    }
    
    // `hsvToRgb`
    // Converts an HSV color value to RGB.
    // *Assumes:* h is contained in [0, 1] or [0, 360] and s and v are contained in [0, 1] or [0, 100]
    // *Returns:* { r, g, b } in the set [0, 255]
     function hsvToRgb(h, s, v) {
    
        h = bound01(h, 360) * 6;
        s = bound01(s, 100);
        v = bound01(v, 100);
    
        var i = math.floor(h),
            f = h - i,
            p = v * (1 - s),
            q = v * (1 - f * s),
            t = v * (1 - (1 - f) * s),
            mod = i % 6,
            r = [v, q, p, p, t, v][mod],
            g = [t, v, v, q, p, p][mod],
            b = [p, p, t, v, v, q][mod];
    
        return { r: r * 255, g: g * 255, b: b * 255 };
    }
    
    // `rgbToHex`
    // Converts an RGB color to hex
    // Assumes r, g, and b are contained in the set [0, 255]
    // Returns a 3 or 6 character hex
    function rgbToHex(r, g, b) {
        var hex = [
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16))
        ];
    
        // Return a 3 character hex if possible
        if (hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
            return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
        }
    
        return hex.join("");
    }
    
    // `equals`
    // Can be called with any tinycolor input
    tinycolor.equals = function (color1, color2) {
        if (!color1 || !color2) { return false; }
        return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
    };
    tinycolor.random = function() {
        return tinycolor.fromRatio({
            r: mathRandom(),
            g: mathRandom(),
            b: mathRandom()
        });
    };
    
    
    // Modification Functions
    // ----------------------
    // Thanks to less.js for some of the basics here
    // <https://github.com/cloudhead/less.js/blob/master/lib/less/functions.js>
    
    
    tinycolor.desaturate = function (color, amount) {
        var hsl = tinycolor(color).toHsl();
        hsl.s -= ((amount || 10) / 100);
        hsl.s = clamp01(hsl.s);
        return tinycolor(hsl);
    };
    tinycolor.saturate = function (color, amount) {
        var hsl = tinycolor(color).toHsl();
        hsl.s += ((amount || 10) / 100);
        hsl.s = clamp01(hsl.s);
        return tinycolor(hsl);
    };
    tinycolor.greyscale = function(color) {
        return tinycolor.desaturate(color, 100);
    };
    tinycolor.lighten = function(color, amount) {
        var hsl = tinycolor(color).toHsl();
        hsl.l += ((amount || 10) / 100);
        hsl.l = clamp01(hsl.l);
        return tinycolor(hsl);
    };
    tinycolor.darken = function (color, amount) {
        var hsl = tinycolor(color).toHsl();
        hsl.l -= ((amount || 10) / 100);
        hsl.l = clamp01(hsl.l);
        return tinycolor(hsl);
    };
    tinycolor.complement = function(color) {
        var hsl = tinycolor(color).toHsl();
        hsl.h = (hsl.h + 180) % 360;
        return tinycolor(hsl);
    };
    
    
    // Combination Functions
    // ---------------------
    // Thanks to jQuery xColor for some of the ideas behind these
    // <https://github.com/infusion/jQuery-xcolor/blob/master/jquery.xcolor.js>
    
    tinycolor.triad = function(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 120) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 240) % 360, s: hsl.s, l: hsl.l })
        ];
    };
    tinycolor.tetrad = function(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 90) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 180) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 270) % 360, s: hsl.s, l: hsl.l })
        ];
    };
    tinycolor.splitcomplement = function(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 72) % 360, s: hsl.s, l: hsl.l}),
            tinycolor({ h: (h + 216) % 360, s: hsl.s, l: hsl.l})
        ];
    };
    tinycolor.analogous = function(color, results, slices) {
        results = results || 6;
        slices = slices || 30;
    
        var hsl = tinycolor(color).toHsl();
        var part = 360 / slices;
        var ret = [tinycolor(color)];
    
        for (hsl.h = ((hsl.h - (part * results >> 1)) + 720) % 360; --results; ) {
            hsl.h = (hsl.h + part) % 360;
            ret.push(tinycolor(hsl));
        }
        return ret;
    };
    tinycolor.monochromatic = function(color, results) {
        results = results || 6;
        var hsv = tinycolor(color).toHsv();
        var h = hsv.h, s = hsv.s, v = hsv.v;
        var ret = [];
        var modification = 1 / results;
    
        while (results--) {
            ret.push(tinycolor({ h: h, s: s, v: v}));
            v = (v + modification) % 1;
        }
    
        return ret;
    };
    // Readability based on W3C recommendations: http://www.w3.org/TR/AERT#color-contrast
    // Returns object with two properties:
    //   .brightness: the difference in brightness between the two colors
    //   .color: the difference in color/hue between the two colors
    // An "acceptable" color is considered to have a brightness difference of 125 and a
    // color difference of 500
    tinycolor.readability = function(color1, color2) {
        var a = tinycolor(color1).toRgb(), b = tinycolor(color2).toRgb();
        var brightnessA = (a.r * 299 + a.g * 587 + a.b * 114) / 1000;
        var brightnessB = (b.r * 299 + b.g * 587 + b.b * 114) / 1000;
        var colorDiff = (
            Math.max(a.r, b.r) - Math.min(a.r, b.r) +
            Math.max(a.g, b.g) - Math.min(a.g, b.g) +
            Math.max(a.b, b.b) - Math.min(a.b, b.b));
        return {
            brightness: Math.abs(brightnessA - brightnessB),
            color: colorDiff
        };
    };
    // True if using color1 over color2 (or vice versa) is "readable"
    // Based on: http://www.w3.org/TR/AERT#color-contrast
    // Example:
    //   tinycolor.readable("#000", "#111") => false
    tinycolor.readable = function(color1, color2) {
        var readability = tinycolor.readability(color1, color2);
        return readability.brightness > 125 && readability.color > 500;
    };
    // Given a base color and a list of possible foreground or background
    // colors for that base, returns the most readable color.
    // Example:
    //   tinycolor.mostReadable("#123", ["#fff", "#000"]) => "#000"
    tinycolor.mostReadable = function(baseColor, colorList) {
        var bestColor;
        var bestScore = 0;
        var bestIsReadable = false;
        for (var i=0; i < colorList.length; i++) {
            var readability = tinycolor.readability(baseColor, colorList[i]);
            var readable = readability.brightness > 125 && readability.color > 500;
            // We normalize both around the "acceptable" breaking point,
            // but rank brightness constrast higher than hue.  Why?  I'm
            // not sure, seems reasonable.
            var score = 3 * (readability.brightness / 125) + (readability.color / 500);
            if ((readable && ! bestIsReadable) ||
                (readable && bestIsReadable && score > bestScore) ||
                ((! readable) && (! bestIsReadable) && score > bestScore)) {
                bestIsReadable = readable;
                bestScore = score;
                bestColor = colorList[i];
            }
        }
        return bestColor;
    };
    
    
    // Big List of Colors
    // ---------
    // <http://www.w3.org/TR/css3-color/#svg-color>
    var names = tinycolor.names = {
        aliceblue: "f0f8ff",
        antiquewhite: "faebd7",
        aqua: "0ff",
        aquamarine: "7fffd4",
        azure: "f0ffff",
        beige: "f5f5dc",
        bisque: "ffe4c4",
        black: "000",
        blanchedalmond: "ffebcd",
        blue: "00f",
        blueviolet: "8a2be2",
        brown: "a52a2a",
        burlywood: "deb887",
        burntsienna: "ea7e5d",
        cadetblue: "5f9ea0",
        chartreuse: "7fff00",
        chocolate: "d2691e",
        coral: "ff7f50",
        cornflowerblue: "6495ed",
        cornsilk: "fff8dc",
        crimson: "dc143c",
        cyan: "0ff",
        darkblue: "00008b",
        darkcyan: "008b8b",
        darkgoldenrod: "b8860b",
        darkgray: "a9a9a9",
        darkgreen: "006400",
        darkgrey: "a9a9a9",
        darkkhaki: "bdb76b",
        darkmagenta: "8b008b",
        darkolivegreen: "556b2f",
        darkorange: "ff8c00",
        darkorchid: "9932cc",
        darkred: "8b0000",
        darksalmon: "e9967a",
        darkseagreen: "8fbc8f",
        darkslateblue: "483d8b",
        darkslategray: "2f4f4f",
        darkslategrey: "2f4f4f",
        darkturquoise: "00ced1",
        darkviolet: "9400d3",
        deeppink: "ff1493",
        deepskyblue: "00bfff",
        dimgray: "696969",
        dimgrey: "696969",
        dodgerblue: "1e90ff",
        firebrick: "b22222",
        floralwhite: "fffaf0",
        forestgreen: "228b22",
        fuchsia: "f0f",
        gainsboro: "dcdcdc",
        ghostwhite: "f8f8ff",
        gold: "ffd700",
        goldenrod: "daa520",
        gray: "808080",
        green: "008000",
        greenyellow: "adff2f",
        grey: "808080",
        honeydew: "f0fff0",
        hotpink: "ff69b4",
        indianred: "cd5c5c",
        indigo: "4b0082",
        ivory: "fffff0",
        khaki: "f0e68c",
        lavender: "e6e6fa",
        lavenderblush: "fff0f5",
        lawngreen: "7cfc00",
        lemonchiffon: "fffacd",
        lightblue: "add8e6",
        lightcoral: "f08080",
        lightcyan: "e0ffff",
        lightgoldenrodyellow: "fafad2",
        lightgray: "d3d3d3",
        lightgreen: "90ee90",
        lightgrey: "d3d3d3",
        lightpink: "ffb6c1",
        lightsalmon: "ffa07a",
        lightseagreen: "20b2aa",
        lightskyblue: "87cefa",
        lightslategray: "789",
        lightslategrey: "789",
        lightsteelblue: "b0c4de",
        lightyellow: "ffffe0",
        lime: "0f0",
        limegreen: "32cd32",
        linen: "faf0e6",
        magenta: "f0f",
        maroon: "800000",
        mediumaquamarine: "66cdaa",
        mediumblue: "0000cd",
        mediumorchid: "ba55d3",
        mediumpurple: "9370db",
        mediumseagreen: "3cb371",
        mediumslateblue: "7b68ee",
        mediumspringgreen: "00fa9a",
        mediumturquoise: "48d1cc",
        mediumvioletred: "c71585",
        midnightblue: "191970",
        mintcream: "f5fffa",
        mistyrose: "ffe4e1",
        moccasin: "ffe4b5",
        navajowhite: "ffdead",
        navy: "000080",
        oldlace: "fdf5e6",
        olive: "808000",
        olivedrab: "6b8e23",
        orange: "ffa500",
        orangered: "ff4500",
        orchid: "da70d6",
        palegoldenrod: "eee8aa",
        palegreen: "98fb98",
        paleturquoise: "afeeee",
        palevioletred: "db7093",
        papayawhip: "ffefd5",
        peachpuff: "ffdab9",
        peru: "cd853f",
        pink: "ffc0cb",
        plum: "dda0dd",
        powderblue: "b0e0e6",
        purple: "800080",
        red: "f00",
        rosybrown: "bc8f8f",
        royalblue: "4169e1",
        saddlebrown: "8b4513",
        salmon: "fa8072",
        sandybrown: "f4a460",
        seagreen: "2e8b57",
        seashell: "fff5ee",
        sienna: "a0522d",
        silver: "c0c0c0",
        skyblue: "87ceeb",
        slateblue: "6a5acd",
        slategray: "708090",
        slategrey: "708090",
        snow: "fffafa",
        springgreen: "00ff7f",
        steelblue: "4682b4",
        tan: "d2b48c",
        teal: "008080",
        thistle: "d8bfd8",
        tomato: "ff6347",
        turquoise: "40e0d0",
        violet: "ee82ee",
        wheat: "f5deb3",
        white: "fff",
        whitesmoke: "f5f5f5",
        yellow: "ff0",
        yellowgreen: "9acd32"
    };
    
    // Make it easy to access colors via `hexNames[hex]`
    var hexNames = tinycolor.hexNames = flip(names);
    
    
    // Utilities
    // ---------
    
    // `{ 'name1': 'val1' }` becomes `{ 'val1': 'name1' }`
    function flip(o) {
        var flipped = { };
        for (var i in o) {
            if (o.hasOwnProperty(i)) {
                flipped[o[i]] = i;
            }
        }
        return flipped;
    }
    
    // Take input from [0, n] and return it as [0, 1]
    function bound01(n, max) {
        if (isOnePointZero(n)) { n = "100%"; }
    
        var processPercent = isPercentage(n);
        n = mathMin(max, mathMax(0, parseFloat(n)));
    
        // Automatically convert percentage into number
        if (processPercent) {
            n = parseInt(n * max, 10) / 100;
        }
    
        // Handle floating point rounding errors
        if ((math.abs(n - max) < 0.000001)) {
            return 1;
        }
    
        // Convert into [0, 1] range if it isn't already
        return (n % max) / parseFloat(max);
    }
    
    // Force a number between 0 and 1
    function clamp01(val) {
        return mathMin(1, mathMax(0, val));
    }
    
    // Parse an integer into hex
    function parseHex(val) {
        return parseInt(val, 16);
    }
    
    // Need to handle 1.0 as 100%, since once it is a number, there is no difference between it and 1
    // <http://stackoverflow.com/questions/7422072/javascript-how-to-detect-number-as-a-decimal-including-1-0>
    function isOnePointZero(n) {
        return typeof n == "string" && n.indexOf('.') != -1 && parseFloat(n) === 1;
    }
    
    // Check to see if string passed in is a percentage
    function isPercentage(n) {
        return typeof n === "string" && n.indexOf('%') != -1;
    }
    
    // Force a hex value to have 2 characters
    function pad2(c) {
        return c.length == 1 ? '0' + c : '' + c;
    }
    
    // Replace a decimal with it's percentage value
    function convertToPercentage(n) {
        if (n <= 1) {
            n = (n * 100) + "%";
        }
    
        return n;
    }
    
    var matchers = (function() {
    
        // <http://www.w3.org/TR/css3-values/#integers>
        var CSS_INTEGER = "[-\\+]?\\d+%?";
    
        // <http://www.w3.org/TR/css3-values/#number-value>
        var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";
    
        // Allow positive/negative integer/number.  Don't capture the either/or, just the entire outcome.
        var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";
    
        // Actual matching.
        // Parentheses and commas are optional, but not required.
        // Whitespace can take the place of commas or opening paren
        var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
        var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
    
        return {
            rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
            rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
            hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
            hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
            hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
            hex3: /^([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
            hex6: /^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
        };
    })();
    
    // `stringInputToObject`
    // Permissive string parsing.  Take in a number of formats, and output an object
    // based on detected format.  Returns `{ r, g, b }` or `{ h, s, l }` or `{ h, s, v}`
    function stringInputToObject(color) {
    
        color = color.replace(trimLeft,'').replace(trimRight, '').toLowerCase();
        var named = false;
        if (names[color]) {
            color = names[color];
            named = true;
        }
        else if (color == 'transparent') {
            return { r: 0, g: 0, b: 0, a: 0 };
        }
    
        // Try to match string input using regular expressions.
        // Keep most of the number bounding out of this function - don't worry about [0,1] or [0,100] or [0,360]
        // Just return an object and let the conversion functions handle that.
        // This way the result will be the same whether the tinycolor is initialized with string or object.
        var match;
        if ((match = matchers.rgb.exec(color))) {
            return { r: match[1], g: match[2], b: match[3] };
        }
        if ((match = matchers.rgba.exec(color))) {
            return { r: match[1], g: match[2], b: match[3], a: match[4] };
        }
        if ((match = matchers.hsl.exec(color))) {
            return { h: match[1], s: match[2], l: match[3] };
        }
        if ((match = matchers.hsla.exec(color))) {
            return { h: match[1], s: match[2], l: match[3], a: match[4] };
        }
        if ((match = matchers.hsv.exec(color))) {
            return { h: match[1], s: match[2], v: match[3] };
        }
        if ((match = matchers.hex6.exec(color))) {
            return {
                r: parseHex(match[1]),
                g: parseHex(match[2]),
                b: parseHex(match[3]),
                format: named ? "name" : "hex"
            };
        }
        if ((match = matchers.hex3.exec(color))) {
            return {
                r: parseHex(match[1] + '' + match[1]),
                g: parseHex(match[2] + '' + match[2]),
                b: parseHex(match[3] + '' + match[3]),
                format: named ? "name" : "hex"
            };
        }
    
        return false;
    }
    
    // Node: Export function
    if (typeof module !== "undefined" && module.exports) {
        module.exports = tinycolor;
    }
    // AMD/requirejs: Define the module
    else if (typeof define !== "undefined") {
        define('tinycolor',[],function () {return tinycolor;});
    }
    // Browser: Expose to window
    else {
        root.tinycolor = tinycolor;
    }
    
    })(this);
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('elementFinder',["util", "jquery"], function (util, $) {
      var elementFinder = util.Module("elementFinder");
      var assert = util.assert;
    
      elementFinder.ignoreElement = function ignoreElement(el) {
        if (el instanceof $) {
          el = el[0];
        }
        while (el) {
          if ($(el).hasClass("togetherjs")) {
            return true;
          }
          el = el.parentNode;
        }
        return false;
      };
    
      elementFinder.elementLocation = function elementLocation(el) {
        assert(el !== null, "Got null element");
        if (el instanceof $) {
          // a jQuery element
          el = el[0];
        }
        if (el[0] && el.attr && el[0].nodeType == 1) {
          // Or a jQuery element not made by us
          el = el[0];
        }
        if (el.id) {
          return "#" + el.id;
        }
        if (el.tagName == "BODY") {
          return "body";
        }
        if (el.tagName == "HEAD") {
          return "head";
        }
        if (el === document) {
          return "document";
        }
        var parent = el.parentNode;
        if ((! parent) || parent == el) {
          console.warn("elementLocation(", el, ") has null parent");
          throw new Error("No locatable parent found");
        }
        var parentLocation = elementLocation(parent);
        var children = parent.childNodes;
        var _len = children.length;
        var index = 0;
        for (var i=0; i<_len; i++) {
          if (children[i] == el) {
            break;
          }
          if (children[i].nodeType == document.ELEMENT_NODE) {
            if (children[i].className.indexOf && children[i].className.indexOf("togetherjs") != -1) {
              // Don't count our UI
              continue;
            }
            // Don't count text or comments
            index++;
          }
        }
        return parentLocation + ":nth-child(" + (index+1) + ")";
      };
    
      elementFinder.CannotFind = util.Class({
        constructor: function CannotFind(location, reason, context) {
          this.prefix = "";
          this.location = location;
          this.reason = reason;
          this.context = context;
        },
        toString: function () {
          var loc;
          try {
            loc = elementFinder.elementLocation(this.context);
          } catch (e) {
            loc = this.context;
          }
          return (
            "[CannotFind " + this.prefix +
              "(" + this.location + "): " +
              this.reason + " in " +
              loc + "]");
        }
      });
    
      elementFinder.findElement = function findElement(loc, container) {
        // FIXME: should this all just be done with document.querySelector()?
        // But no!  We can't ignore togetherjs elements with querySelector.
        // But maybe!  We *could* make togetherjs elements less obtrusive?
        container = container || document;
        var el, rest;
        if (loc === "body") {
          return document.body;
        } else if (loc === "head") {
          return document.head;
        } else if (loc === "document") {
          return document;
        } else if (loc.indexOf("body") === 0) {
          el = document.body;
          try {
            return findElement(loc.substr(("body").length), el);
          } catch (e) {
            if (e instanceof elementFinder.CannotFind) {
              e.prefix = "body" + e.prefix;
            }
            throw e;
          }
        } else if (loc.indexOf("head") === 0) {
          el = document.head;
          try {
            return findElement(loc.substr(("head").length), el);
          } catch (e) {
            if (e instanceof elementFinder.CannotFind) {
              e.prefix = "head" + e.prefix;
            }
            throw e;
          }
        } else if (loc.indexOf("#") === 0) {
          var id;
          loc = loc.substr(1);
          if (loc.indexOf(":") === -1) {
            id = loc;
            rest = "";
          } else {
            id = loc.substr(0, loc.indexOf(":"));
            rest = loc.substr(loc.indexOf(":"));
          }
          el = document.getElementById(id);
          if (! el) {
            throw elementFinder.CannotFind("#" + id, "No element by that id", container);
          }
          if (rest) {
            try {
              return findElement(rest, el);
            } catch (e) {
              if (e instanceof elementFinder.CannotFind) {
                e.prefix = "#" + id + e.prefix;
              }
              throw e;
            }
          } else {
            return el;
          }
        } else if (loc.indexOf(":nth-child(") === 0) {
          loc = loc.substr((":nth-child(").length);
          if (loc.indexOf(")") == -1) {
            throw "Invalid location, missing ): " + loc;
          }
          var num = loc.substr(0, loc.indexOf(")"));
          num = parseInt(num, 10);
          var count = num;
          loc = loc.substr(loc.indexOf(")") + 1);
          var children = container.childNodes;
          el = null;
          for (var i=0; i<children.length; i++) {
            var child = children[i];
            if (child.nodeType == document.ELEMENT_NODE) {
              if (children[i].className.indexOf && children[i].className.indexOf("togetherjs") != -1) {
                continue;
              }
              count--;
              if (count === 0) {
                // this is the element
                el = child;
                break;
              }
            }
          }
          if (! el) {
            throw elementFinder.CannotFind(":nth-child(" + num + ")", "container only has " + (num - count) + " elements", container);
          }
          if (loc) {
            try {
              return elementFinder.findElement(loc, el);
            } catch (e) {
              if (e instanceof elementFinder.CannotFind) {
                e.prefix = ":nth-child(" + num + ")" + e.prefix;
              }
              throw e;
            }
          } else {
            return el;
          }
        } else {
          throw elementFinder.CannotFind(loc, "Malformed location", container);
        }
      };
    
      elementFinder.elementByPixel = function (height) {
        /* Returns {location: "...", offset: pixels}
    
           To get the pixel position back, you'd do:
             $(location).offset().top + offset
         */
        function search(start, height) {
          var last = null;
          var children = start.children();
          children.each(function () {
            var el = $(this);
            if (el.hasClass("togetherjs") || el.css("position") == "fixed" || ! el.is(":visible")) {
              return;
            }
            if (el.offset().top > height) {
              return false;
            }
            last = el;
          });
          if ((! children.length) || (! last)) {
            // There are no children, or only inapplicable children
            return {
              location: elementFinder.elementLocation(start[0]),
              offset: height - start.offset().top,
              absoluteTop: height,
              documentHeight: $(document).height()
            };
          }
          return search(last, height);
        }
        return search($(document.body), height);
      };
    
      elementFinder.pixelForPosition = function (position) {
        /* Inverse of elementFinder.elementByPixel */
        if (position.location == "body") {
          return position.offset;
        }
        var el;
        try {
          el = elementFinder.findElement(position.location);
        } catch (e) {
          if (e instanceof elementFinder.CannotFind && position.absoluteTop) {
            // We don't trust absoluteTop to be quite right locally, so we adjust
            // for the total document height differences:
            var percent = position.absoluteTop / position.documentHeight;
            return $(document).height() * percent;
          }
          throw e;
        }
        var top = $(el).offset().top;
        // FIXME: maybe here we should test for sanity, like if an element is
        // hidden.  We can use position.absoluteTop to get a sense of where the
        // element roughly should be.  If the sanity check failed we'd use
        // absoluteTop
        return top + position.offset;
      };
    
      return elementFinder;
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    /* Loading this module will cause, when TogetherJS is active, the
       session object to emit visibility-change with a `hidden` argument
       whenever the visibility changes, on browsers where we can detect
       it.
       */
    
    define('visibilityApi',["util", "session"], function (util, session) {
      var visibilityApi = util.Module("visibilityApi");
      var hidden;
      var visibilityChange;
      if (document.hidden !== undefined) { // Opera 12.10 and Firefox 18 and later support
        hidden = "hidden";
        visibilityChange = "visibilitychange";
      } else if (document.mozHidden !== undefined) {
        hidden = "mozHidden";
        visibilityChange = "mozvisibilitychange";
      } else if (document.msHidden !== undefined) {
        hidden = "msHidden";
        visibilityChange = "msvisibilitychange";
      } else if (document.webkitHidden !== undefined) {
        hidden = "webkitHidden";
        visibilityChange = "webkitvisibilitychange";
      }
    
      session.on("start", function () {
        document.addEventListener(visibilityChange, change, false);
      });
    
      session.on("close", function () {
        document.removeEventListener(visibilityChange, change, false);
      });
    
      function change() {
        session.emit("visibility-change", document[hidden]);
      }
    
      visibilityApi.hidden = function () {
        return document[hidden];
      };
    
      return visibilityApi;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('ui',["require", "jquery", "util", "session", "templates", "templating", "linkify", "peers", "windowing", "tinycolor", "elementFinder", "visibilityApi", "storage"], function (require, $, util, session, templates, templating, linkify, peers, windowing, tinycolor, elementFinder, visibilityApi, storage) {
      var ui = util.Module('ui');
      var assert = util.assert;
      var AssertionError = util.AssertionError;
      var chat;
      var $window = $(window);
      // This is also in togetherjs.less, as @button-height:
      var BUTTON_HEIGHT = 60 + 1; // 60 is button height, 1 is border
      // chat TextArea
      var TEXTAREA_LINE_HEIGHT = 20; // in pixels
      var TEXTAREA_MAX_LINES = 5;
      // This is also in togetherjs.less, under .togetherjs-animated
      var ANIMATION_DURATION = 1000;
      // Time the new user window sticks around until it fades away:
      var NEW_USER_FADE_TIMEOUT = 5000;
      // This is set when an animation will keep the UI from being ready
      // (until this time):
      var finishedAt = null;
      // Time in milliseconds for the dock to animate out:
      var DOCK_ANIMATION_TIME = 300;
      // If two chat messages come from the same person in this time
      // (milliseconds) then they are collapsed into one message:
      var COLLAPSE_MESSAGE_LIMIT = 5000;
    
      var COLORS = [
        "#8A2BE2", "#7FFF00", "#DC143C", "#00FFFF", "#8FBC8F", "#FF8C00", "#FF00FF",
        "#FFD700", "#F08080", "#90EE90", "#FF6347"];
    
      // This would be a circular import, but we just need the chat module sometime
      // after everything is loaded, and this is sure to complete by that time:
      require(["chat"], function (c) {
        chat = c;
      });
    
      /* Displays some toggleable element; toggleable elements have a
         data-toggles attribute that indicates what other elements should
         be hidden when this element is shown. */
      ui.displayToggle = function (el) {
        el = $(el);
        assert(el.length, "No element", arguments[0]);
        var other = $(el.attr("data-toggles"));
        assert(other.length, "Cannot toggle", el[0], "selector", other.selector);
        other.hide();
        el.show();
      };
    
      ui.panelPosition = function () {
        var iface = $("#togetherjs-dock");
        if (iface.hasClass("togetherjs-dock-right")) {
          return "right";
        } else if (iface.hasClass("togetherjs-dock-left")) {
          return "left";
        } else if (iface.hasClass("togetherjs-dock-top")) {
          return "top";
        } else if (iface.hasClass("togetherjs-dock-bottom")) {
          return "bottom";
        } else {
          throw new AssertionError("#togetherjs-dock doesn't have positioning class");
        }
      }
    
      ui.container = null;
    
      // This is used for some signalling when ui.prepareUI and/or
      // ui.activateUI is called before the DOM is fully loaded:
      var deferringPrepareUI = null;
    
      function deferForContainer(func) {
        /* Defers any calls to func() until after ui.container is set
           Function cannot have a return value (as sometimes the call will
           become async).  Use like:
    
           method: deferForContainer(function (args) {...})
           */
        return function () {
          if (ui.container) {
            func.apply(this, arguments);
          }
          var self = this;
          var args = Array.prototype.slice.call(arguments);
          session.once("ui-ready", function () {
            func.apply(self, args);
          });
        };
      }
    
      // This is called before activateUI; it doesn't bind anything, but does display
      // the dock
      // FIXME: because this module has lots of requirements we can't do
      // this before those requirements are loaded.  Maybe worth splitting
      // this out?  OTOH, in production we should have all the files
      // combined so there's not much problem loading those modules.
      ui.prepareUI = function () {
        if (! (document.readyState == "complete" || document.readyState == "interactive")) {
          // Too soon!  Wait a sec...
          deferringPrepareUI = "deferring";
          document.addEventListener("DOMContentLoaded", function () {
            var d = deferringPrepareUI;
            deferringPrepareUI = null;
            ui.prepareUI();
            // This happens when ui.activateUI is called before the document has been
            // loaded:
            if (d == "activate") {
              ui.activateUI();
            }
          });
          return;
        }
        var container = ui.container = $(templates["interface"]);
        assert(container.length);
        $("body").append(container);
        const iface = container.find("#togetherjs-dock")
        iface.css("visibility", "hidden")
        storage.settings.get("dockConfig").then(s => {
          if (s) {
            s.pos.visibility = ""
            iface.addClass(s["class"])
            iface.css(s.pos)
          } else {
            iface.addClass("togetherjs-dock-right")
            iface.css({right: "5px", top: "5px", visibility: ""})
          }
        })
        $("#togetherjs-buttons").addClass("on")
        fixupAvatars(container);
        if (session.firstRun && TogetherJS.startTarget) {
          // Time at which the UI will be fully ready:
          // (We have to do this because the offset won't be quite right
          // until the animation finishes - attempts to calculate the
          // offset without taking into account CSS transforms have so far
          // failed.)
          var timeoutSeconds = DOCK_ANIMATION_TIME / 1000;
          finishedAt = Date.now() + DOCK_ANIMATION_TIME + 50;
          setTimeout(function () {
            finishedAt = Date.now() + DOCK_ANIMATION_TIME + 40;
            var start = iface.offset();
            var pos = $(TogetherJS.startTarget).offset();
            pos.top = Math.floor(pos.top - start.top);
            pos.left = Math.floor(pos.left - start.left);
            var translate = "translate(" + pos.left + "px, " + pos.top + "px)";
            iface.css({
              MozTransform: translate,
              WebkitTransform: translate,
              transform: translate,
              opacity: "0.0"
            });
            setTimeout(function () {
              // We keep recalculating because the setTimeout times aren't always so accurate:
              finishedAt = Date.now() + DOCK_ANIMATION_TIME + 20;
              var transition = "transform " + timeoutSeconds + "s ease-out, ";
              transition += "opacity " + timeoutSeconds + "s ease-out";
              iface.css({
                opacity: "1.0",
                MozTransition: "-moz-" + transition,
                MozTransform: "translate(0, 0)",
                WebkitTransition: "-webkit-" + transition,
                WebkitTransform: "translate(0, 0)",
                transition: transition,
                transform: "translate(0, 0)"
              });
              setTimeout(function () {
                finishedAt = null;
                iface.attr("style", "");
              }, 510);
            }, 5);
          }, 5);
        }
        if (TogetherJS.startTarget) {
          var el = $(TogetherJS.startTarget);
          var text = el.text().toLowerCase().replace(/\s+/g, " ");
          text = text.replace(/^\s*/, "").replace(/\s*$/, "");
          if (text == "start togetherjs") {
            el.attr("data-end-togetherjs-html", "End TogetherJS");
          }
          if (el.attr("data-end-togetherjs-html")) {
            el.attr("data-start-togetherjs-html", el.html());
            el.html(el.attr("data-end-togetherjs-html"));
          }
          el.addClass("togetherjs-started");
        }
        ui.container.find(".togetherjs-window > header, .togetherjs-modal > header").each(function () {
          $(this).append($('<button class="togetherjs-close"></button>'));
        });
    
        TogetherJS.config.track("disableWebRTC", function (hide, previous) {
          if (hide && ! previous) {
            ui.container.find("#togetherjs-audio-button").hide();
            adjustDockPos();
          } else if ((! hide) && previous) {
            ui.container.find("#togetherjs-audio-button").show();
            adjustDockPos();
          }
        });
    
      };
    
      // After prepareUI, this actually makes the interface live.  We have
      // to do this later because we call prepareUI when many components
      // aren't initialized, so we don't even want the user to be able to
      // interact with the interface.  But activateUI is called once
      // everything is loaded and ready for interaction.
      ui.activateUI = function () {
        if (deferringPrepareUI) {
          console.warn("ui.activateUI called before document is ready; waiting...");
          deferringPrepareUI = "activate";
          return;
        }
        if (! ui.container) {
          ui.prepareUI();
        }
        var container = ui.container;
    
        //create the overlay
        if($.browser.mobile) {
          // $("body").append( "\x3cdiv class='overlay' style='position: absolute; top: 0; left: 0; background-color: rgba(0,0,0,0); width: 120%; height: 100%; z-index: 1000; margin: -10px'>\x3c/div>" );
        }
    
        // The share link:
        ui.prepareShareLink(container);
        container.find("input.togetherjs-share-link").on("keydown", function (event) {
          if (event.which == 27) {
            windowing.hide("#togetherjs-share");
            return false;
          }
          return undefined;
        });
        session.on("shareId", updateShareLink);
    
        // The chat input element:
        var input = container.find("#togetherjs-chat-input");
        input.bind("keydown", function (event) {
          if (event.which == 13 && !event.shiftKey) { // Enter without Shift pressed
            submitChat();
            return false;
          }
          if (event.which == 27) { // Escape
            windowing.hide("#togetherjs-chat");
            return false;
          }
        });
    
        function submitChat() {
          var val = input.val();
          if ($.trim(val)) {
            input.val("");
            // triggering the event manually to avoid the addition of newline character to the textarea:
            input.trigger("input").trigger("propertychange");
            chat.submit(val);
          }
        }
        // auto-resize textarea:
        input.on("input propertychange", function () {
          var $this = $(this);
          var actualHeight = $this.height();
          // reset the height of textarea to remove trailing empty space (used for shrinking):
          $this.height(TEXTAREA_LINE_HEIGHT);
          this.scrollTop = 0;
          // scroll to bottom:
          this.scrollTop = 9999;
          var newHeight = this.scrollTop + $this.height();
          var maxHeight = TEXTAREA_MAX_LINES * TEXTAREA_LINE_HEIGHT;
          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            this.style.overflowY = "scroll";
          } else {
            this.style.overflowY = "hidden";
          }
          this.style.height = newHeight + "px";
          var diff = newHeight - actualHeight;
          $("#togetherjs-chat-input-box").height($("#togetherjs-chat-input-box").height() + diff);
          $("#togetherjs-chat-messages").height($("#togetherjs-chat-messages").height() - diff);
          return false;
        });
    
        util.testExpose({submitChat: submitChat});
    
        // Moving the window:
        // FIXME: this should probably be stickier, and not just move the window around
        // so abruptly
        var anchor = container.find("#togetherjs-dock-anchor");
        assert(anchor.length);
        anchor.mousedown(function (event) {
          const iface = $("#togetherjs-dock");
          const startLeft= parseInt(iface.css("left"))
          const startTop = parseInt(iface.css("top"))
    
          $("#togetherjs-menu").hide()
          windowing.hide();
    
          function selectoff() {
            return false;
          }
          function mousemove(event2) {
            let left = startLeft + event2.screenX - event.screenX
            let right
            let top = startTop + event2.screenY - event.screenY
            let bottom
            iface.css({ right: "", bottom: "" })
            if (iface.lockedHor) {
              if (left < 5) {
                left = "5px"
                right = ""
              } else {
                iface.css("left", left + "px")
                if (parseInt(iface.css("right")) < 5) {
                  left = ""
                  right = "5px"
                }
              }
            } else {
              if (left < 50) {
                iface.lockedVert = true
                left = "5px"
                right = ""
              } else {
                iface.css("left", left + "px")
                if (parseInt(iface.css("right")) < 50) {
                  iface.lockedVert = true
                  left = ""
                  right = "5px"
                } else
                  iface.lockedVert = false
              }
            }
            if (iface.lockedVert) {
              if (top < 5) {
                top = "5px"
                bottom = ""
              } else {
                iface.css("top", top + "px")
                if (parseInt(iface.css("bottom")) < 5) {
                  top = ""
                  bottom = "5px"
                }
              }
            } else {
              if (top < 50) {
                iface.lockedHor = true
                top = "5px"
                bottom = ""
              } else {
                iface.css("top", top + "px")
                if ((iface.threshold && (top > iface.threshold)) || (!iface.threshold && (parseInt(iface.css("bottom")) < 50))) {
                    iface.lockedHor = true
                    top = ""
                    bottom = "5px"
                } else {
                  iface.lockedHor = false
                  delete iface.threshold
                }
              }
            }
            iface.css({ left: left, right: right, top: top, bottom: bottom })
            if (iface.lockedHor) {
              if (iface.css("bottom") == "5px") {
                if (!iface.threshold)
                  iface.threshold = parseInt(iface.css("top")) - 50
                iface.removeClass("togetherjs-dock-left togetherjs-dock-right togetherjs-dock-top")
                iface.addClass("togetherjs-dock-bottom")
              } else {
                iface.removeClass("togetherjs-dock-left togetherjs-dock-right togetherjs-dock-bottom")
                iface.addClass("togetherjs-dock-top")
              }
            } else if (parseInt(iface.css("right")) < 330) {
              iface.removeClass("togetherjs-dock-left togetherjs-dock-top togetherjs-dock-bottom")
              iface.addClass("togetherjs-dock-right")
            } else {
              iface.removeClass("togetherjs-dock-right togetherjs-dock-top togetherjs-dock-bottom")
              iface.addClass("togetherjs-dock-left")
            }
          }
          $(document).bind("mousemove", mousemove);
          // If you don't turn selection off it will still select text, and show a
          // text selection cursor:
          $(document).bind("selectstart", selectoff);
          // FIXME: it seems like sometimes we lose the mouseup event, and it's as though
          // the mouse is stuck down:
          $(document).one("mouseup", function () {
            // const iface = $("#togetherjs-dock")
            const style = iface[0].style
            const pos = {}
            if (style.left)
              pos.left = style.left
            else
              pos.right = style.right
            if (style.top)
              pos.top = style.top
            else
              pos.bottom = style.bottom
            storage.settings.set("dockConfig", {pos: pos,
                                                "class": iface.hasClass("togetherjs-dock-right") ? "togetherjs-dock-right"
                                                       : iface.hasClass("togetherjs-dock-top") ? "togetherjs-dock-top"
                                                       : iface.hasClass("togetherjs-dock-bottom") ? "togetherjs-dock-bottom"
                                                       : "togetherjs-dock-left"})
            $(document).unbind("mousemove", mousemove);
            $(document).unbind("selectstart", selectoff);
          });
          return false;
        });
    
        function openDock() {
          $('.togetherjs-window').animate({
            opacity: 1
          });
          $('#togetherjs-dock-participants').animate({
            opacity: 1
          });
          $('#togetherjs-dock #togetherjs-buttons').animate({
            opacity: 1
          });
    
          //for iphone
          if($(window).width() < 480) {
            $('.togetherjs-dock-right').animate({
              width: "204px"
            }, {
              duration:60, easing:"linear"
            });
          }
    
          //for ipad
          else {
            $('.togetherjs-dock-right').animate({
              width: "27%"
            }, {
              duration:60, easing:"linear"
            });
          }
    
    
          // add bg overlay
          // $("body").append( "\x3cdiv class='overlay' style='position: absolute; top: 0; left: -2px; background-color: rgba(0,0,0,0.5); width: 200%; height: 400%; z-index: 1000; margin: 0px;'>\x3c/div>" );
    
          //disable vertical scrolling
          // $("body").css({
          //   "position": "fixed",
          //   top: 0,
          //   left: 0
          // });
    
          //replace the anchor icon
          var src = TogetherJS.baseUrl + "/togetherjs/images/togetherjs-logo-close.png";
          $("#togetherjs-dock-anchor #togetherjs-dock-anchor-horizontal img").attr("src", src);
        }
    
        function closeDock() {
          //enable vertical scrolling
          $("body").css({
            "position": "",
            top: "",
            left: ""
          });
    
          //replace the anchor icon
          var src = TogetherJS.baseUrl + "/togetherjs/images/togetherjs-logo-open.png";
          $("#togetherjs-dock-anchor #togetherjs-dock-anchor-horizontal img").attr("src", src);
    
          $('.togetherjs-window').animate({
            opacity: 0
          });
          $('#togetherjs-dock-participants').animate({
            opacity: 0
          });
          $('#togetherjs-dock #togetherjs-buttons').animate({
            opacity: 0
          });
          $('.togetherjs-dock-right').animate({
            width: "40px"
          }, {
            duration:60, easing:"linear"
          });
    
          // remove bg overlay
          //$(".overlay").remove();
        }
    
        // Setting the anchor button + dock mobile actions
        if($.browser.mobile) {
    
          // toggle the audio button
          $("#togetherjs-audio-button").click(function () {
            windowing.toggle("#togetherjs-rtc-not-supported");
          });
    
          // toggle the profile button
          $("#togetherjs-profile-button").click(function () {
            windowing.toggle("#togetherjs-menu-window");
          });
    
          // $("body").append( "\x3cdiv class='overlay' style='position: absolute; top: 0; left: -2px; background-color: rgba(0,0,0,0.5); width: 200%; height: 400%; z-index: 1000; margin: 0px'>\x3c/div>" );
    
          //disable vertical scrolling
          // $("body").css({
          //   "position": "fixed",
          //   top: 0,
          //   left: 0
          // });
    
          //replace the anchor icon
          var src = "/togetherjs/images/togetherjs-logo-close.png";
          $("#togetherjs-dock-anchor #togetherjs-dock-anchor-horizontal img").attr("src", src);
    
          $("#togetherjs-dock-anchor").toggle(function() {
              closeDock();
            },function(){
              openDock();
          });
        }
    
        $("#togetherjs-share-button").click(function () {
          windowing.toggle("#togetherjs-share");
        });
    
        $("#togetherjs-profile-button").click(function (event) {
          if ($.browser.mobile) {
            windowing.show("#togetherjs-menu-window");
            return false;
          }
          toggleMenu();
          event.stopPropagation();
          return false;
        });
    
        $("#togetherjs-menu-feedback, #togetherjs-menu-feedback-button").click(function(){
          windowing.hide();
          hideMenu();
          windowing.show("#togetherjs-feedback-form");
        });
    
        $("#togetherjs-menu-help, #togetherjs-menu-help-button").click(function () {
          windowing.hide();
          hideMenu();
          require(["walkthrough"], function (walkthrough) {
            windowing.hide();
            walkthrough.start(false);
          });
        });
    
        $("#togetherjs-menu-update-name").click(function () {
          var input = $("#togetherjs-menu .togetherjs-self-name");
          input.css({
            width: $("#togetherjs-menu").width() - 32 + "px"
          });
          ui.displayToggle("#togetherjs-menu .togetherjs-self-name");
          $("#togetherjs-menu .togetherjs-self-name").focus();
        });
    
        $("#togetherjs-menu-update-name-button").click(function () {
          windowing.show("#togetherjs-edit-name-window");
          $("#togetherjs-edit-name-window input").focus();
        });
    
        $("#togetherjs-menu .togetherjs-self-name").bind("keyup change", function (event) {
          //console.log("alrighty", event);
          if (event.which == 13) {
            ui.displayToggle("#togetherjs-self-name-display");
            return;
          }
          var val = $("#togetherjs-menu .togetherjs-self-name").val();
          //console.log("values!!", val);
          if (val) {
            peers.Self.update({name: val});
          }
        });
    
        $("#togetherjs-menu-update-avatar, #togetherjs-menu-update-avatar-button").click(function () {
          hideMenu();
          windowing.show("#togetherjs-avatar-edit");
        });
    
        $("#togetherjs-menu-end, #togetherjs-menu-end-button").click(function () {
          hideMenu();
          windowing.show("#togetherjs-confirm-end");
        });
    
        $("#togetherjs-end-session").click(function () {
          session.close();
          //$(".overlay").remove();
    
        });
    
        $("#togetherjs-menu-update-color").click(function () {
          var picker = $("#togetherjs-pick-color");
          if (picker.is(":visible")) {
            picker.hide();
            return;
          }
          picker.show();
          bindPicker();
          picker.find(".togetherjs-swatch-active").removeClass("togetherjs-swatch-active");
          picker.find(".togetherjs-swatch[data-color=\"" + peers.Self.color + "\"]").addClass("togetherjs-swatch-active");
        });
    
        $("#togetherjs-pick-color").click(".togetherjs-swatch", function (event) {
          var swatch = $(event.target);
          var color = swatch.attr("data-color");
          peers.Self.update({
            color: color
          });
          event.stopPropagation();
          return false;
        });
    
        $("#togetherjs-pick-color").click(function (event) {
          $("#togetherjs-pick-color").hide();
          event.stopPropagation();
          return false;
        });
    
        COLORS.forEach(function (color) {
          var el = templating.sub("swatch");
          el.attr("data-color", color);
          var darkened = tinycolor.darken(color);
          el.css({
            backgroundColor: color,
            borderColor: darkened
          });
          $("#togetherjs-pick-color").append(el);
        });
    
        $("#togetherjs-chat-button").click(function () {
          windowing.toggle("#togetherjs-chat");
        });
    
        session.on("display-window", function (id, element) {
          if (id == "togetherjs-chat") {
            if (! $.browser.mobile) {
              $("#togetherjs-chat-input").focus();
            }
          } else if (id == "togetherjs-share") {
            var link = element.find("input.togetherjs-share-link");
            if (link.is(":visible")) {
              link.focus().select();
            }
          }
        });
    
        container.find("#togetherjs-chat-notifier").click(function (event) {
          if ($(event.target).is("a") || container.is(".togetherjs-close")) {
            return;
          }
          windowing.show("#togetherjs-chat");
        });
    
        // FIXME: Don't think this makes sense
        $(".togetherjs header.togetherjs-title").each(function (index, item) {
          var button = $('<button class="togetherjs-minimize"></button>');
          button.click(function (event) {
            var window = button.closest(".togetherjs-window");
            windowing.hide(window);
          });
          $(item).append(button);
        });
    
        $("#togetherjs-avatar-done").click(function () {
          ui.displayToggle("#togetherjs-no-avatar-edit");
        });
    
        $("#togetherjs-self-color").css({backgroundColor: peers.Self.color});
    
        var avatar = peers.Self.avatar;
        if (avatar) {
          $("#togetherjs-self-avatar").attr("src", avatar);
        }
    
        var starterButton = $("#togetherjs-starter button");
        starterButton.click(function () {
          windowing.show("#togetherjs-about");
        }).addClass("togetherjs-running");
        if (starterButton.text() == "Start TogetherJS") {
          starterButton.attr("data-start-text", starterButton.text());
          starterButton.text("End TogetherJS Session");
        }
    
        ui.activateAvatarEdit(container, {
          onSave: function () {
            windowing.hide("#togetherjs-avatar-edit");
          }
        });
    
        TogetherJS.config.track("inviteFromRoom", function (inviter, previous) {
          if (inviter) {
            container.find("#togetherjs-invite").show();
          } else {
            container.find("#togetherjs-invite").hide();
          }
        });
    
        container.find("#togetherjs-menu-refresh-invite").click(refreshInvite);
        container.find("#togetherjs-menu-invite-anyone").click(function () {
          invite(null);
        });
    
        // The following lines should be at the end of this function
        // (new code goes above)
        session.emit("new-element", ui.container);
    
        if (finishedAt && finishedAt > Date.now()) {
          setTimeout(function () {
            finishedAt = null;
            session.emit("ui-ready", ui);
          }, finishedAt - Date.now());
        } else {
          session.emit("ui-ready", ui);
        }
    
      }; // End ui.activateUI()
    
      ui.activateAvatarEdit = function (container, options) {
        options = options || {};
        var pendingImage = null;
    
        container.find(".togetherjs-avatar-save").prop("disabled", true);
    
        container.find(".togetherjs-avatar-save").click(function () {
          if (pendingImage) {
            peers.Self.update({avatar: pendingImage});
            container.find(".togetherjs-avatar-save").prop("disabled", true);
            if (options.onSave) {
              options.onSave();
            }
          }
        });
    
        container.find(".togetherjs-upload-avatar").on("change", function () {
          util.readFileImage(this).then(function (url) {
            sizeDownImage(url).then(function (smallUrl) {
              pendingImage = smallUrl;
              container.find(".togetherjs-avatar-preview").css({
                backgroundImage: 'url(' + pendingImage + ')'
              });
              container.find(".togetherjs-avatar-save").prop("disabled", false);
              if (options.onPending) {
                options.onPending();
              }
            });
          });
        });
    
      };
    
      function sizeDownImage(imageUrl) {
        return util.Deferred(function (def) {
          var $canvas = $("<canvas>");
          $canvas[0].height = session.AVATAR_SIZE;
          $canvas[0].width = session.AVATAR_SIZE;
          var context = $canvas[0].getContext("2d");
          var img = new Image();
          img.src = imageUrl;
          // Sometimes the DOM updates immediately to call
          // naturalWidth/etc, and sometimes it doesn't; using setTimeout
          // gives it a chance to catch up
          setTimeout(function () {
            var width = img.naturalWidth || img.width;
            var height = img.naturalHeight || img.height;
            width = width * (session.AVATAR_SIZE / height);
            height = session.AVATAR_SIZE;
            context.drawImage(img, 0, 0, width, height);
            def.resolve($canvas[0].toDataURL("image/png"));
          });
        });
      }
    
      function fixupAvatars(container) {
        /* All <div class="togetherjs-person" /> elements need an element inside,
           so we add that element here */
        container.find(".togetherjs-person").each(function () {
          var $this = $(this);
          var inner = $this.find(".togetherjs-person-avatar-swatch");
          if (! inner.length) {
            $this.append('<div class="togetherjs-person-avatar-swatch"></div>');
          }
        });
      }
    
      ui.prepareShareLink = function (container) {
        container.find("input.togetherjs-share-link").click(function () {
          $(this).select();
        }).change(function () {
          updateShareLink();
        });
        container.find("a.togetherjs-share-link").click(function () {
          // FIXME: this is currently opening up Bluetooth, not sharing a link
          if (false && window.MozActivity) {
            var activity = new MozActivity({
              name: "share",
              data: {
                type: "url",
                url: $(this).attr("href")
              }
            });
          }
          // FIXME: should show some help if you actually try to follow the link
          // like this, instead of simply suppressing it
          return false;
        });
        updateShareLink();
      };
    
      // Menu
    
      function showMenu(event) {
        var el = $("#togetherjs-menu");
        assert(el.length);
        el.show();
        bindMenu();
        $(document).bind("click", maybeHideMenu);
      }
    
      function bindMenu() {
        var el = $("#togetherjs-menu:visible");
        if (el.length) {
          const ifacePos = ui.panelPosition()
          var bound = $("#togetherjs-profile-button");
          var boundOffset = bound.offset();
          el.css((ifacePos == "bottom") ? {
            left: (boundOffset.left + 10 - $window.scrollLeft()) + "px",
            top: "",
            bottom: (bound.height() + 5) + "px"
          } : {
            left: (ifacePos == "right") ? (boundOffset.left + bound.width() - 10 - el.width() - $window.scrollLeft()) + "px"
                                        : (boundOffset.left + 10 - $window.scrollLeft()) + "px",
            top: (boundOffset.top + bound.height() - $window.scrollTop()) + "px",
            bottom: ""
              });
          if (parseInt(el.css("bottom")) < 5)
            el.css({
              left: (ifacePos == "right") ? (boundOffset.left - el.width() - $window.scrollLeft()) + "px"
                                          : (boundOffset.left + bound.width() - $window.scrollLeft()) + "px",
              top: "",
              bottom: "5px"
            })
        }
      }
    
      function bindPicker() {
        var picker = $("#togetherjs-pick-color:visible");
        if (picker.length) {
          var menu = $("#togetherjs-menu-update-color");
          var menuOffset = menu.offset();
          picker.css({
            top: menuOffset.top + menu.height(),
            left: menuOffset.left
          });
        }
      }
    
      session.on("resize", function () {
        bindMenu();
        bindPicker();
      });
    
      function toggleMenu() {
        if ($("#togetherjs-menu").is(":visible")) {
          hideMenu();
        } else {
          showMenu();
        }
      }
    
      function hideMenu() {
        var el = $("#togetherjs-menu");
        el.hide();
        $(document).unbind("click", maybeHideMenu);
        ui.displayToggle("#togetherjs-self-name-display");
        $("#togetherjs-pick-color").hide();
      }
    
      function maybeHideMenu(event) {
        var t = event.target;
        while (t) {
          if (t.id == "togetherjs-menu") {
            // Click inside the menu, ignore this
            return;
          }
          t = t.parentNode;
        }
        hideMenu();
      }
    
      function adjustDockPos() {
        const iface = $("#togetherjs-dock")
        const right = parseInt(iface.css("right"))
        const bottom = parseInt(iface.css("bottom"))
        if (right < 5)
          iface.css("left", (parseInt(iface.css("left")) - 5 + right) + "px")
        else if (bottom < 5)
          iface.css("top", (parseInt(iface.css("top")) - 5 + bottom) + "px")
        else
          storage.settings.get("dockConfig").then(s => iface.css(s ? s.pos : {right: "5px", top: "5px"}))
        const buttonContainer = $("#togetherjs-buttons")
        if ($("#togetherjs-dock-participants").children().length)
          buttonContainer.removeClass("on")
        else
          buttonContainer.addClass("on")
      }
    
      // Misc
    
      function updateShareLink() {
        var input = $("input.togetherjs-share-link");
        var link = $("a.togetherjs-share-link");
        var display = $("#togetherjs-session-id");
        if (! session.shareId) {
          input.val("");
          link.attr("href", "#");
          display.text("(none)");
        } else {
          input.val(session.shareUrl());
          link.attr("href", session.shareUrl());
          display.text(session.shareId);
        }
      }
    
      session.on("close", function () {
    
        if($.browser.mobile) {
          // remove bg overlay
          //$(".overlay").remove();
    
          //after hitting End, reset window draggin
          $("body").css({
            "position": "",
            top: "",
            left: ""
          });
    
        }
    
        if (ui.container) {
          ui.container.remove();
          ui.container = null;
        }
        // Clear out any other spurious elements:
        $(".togetherjs").remove();
        var starterButton = $("#togetherjs-starter button");
        starterButton.removeClass("togetherjs-running");
        if (starterButton.attr("data-start-text")) {
          starterButton.text(starterButton.attr("data-start-text"));
          starterButton.attr("data-start-text", "");
        }
        if (TogetherJS.startTarget) {
          var el = $(TogetherJS.startTarget);
          if (el.attr("data-start-togetherjs-html")) {
            el.html(el.attr("data-start-togetherjs-html"));
          }
          el.removeClass("togetherjs-started");
        }
      });
    
      ui.chat = {
        text: function (attrs) {
          assert(typeof attrs.text == "string");
          assert(attrs.peer);
          assert(attrs.messageId);
          var date = attrs.date || Date.now();
          var lastEl = ui.container.find("#togetherjs-chat .togetherjs-chat-message");
          if (lastEl.length) {
            lastEl = $(lastEl[lastEl.length-1]);
          }
          var lastDate = null;
          if (lastEl) {
            lastDate = parseInt(lastEl.attr("data-date"), 10);
          }
          if (lastEl && lastEl.attr("data-person") == attrs.peer.id &&
              lastDate && date < lastDate + COLLAPSE_MESSAGE_LIMIT) {
            lastEl.attr("data-date", date);
            var content = lastEl.find(".togetherjs-chat-content");
            assert(content.length);
            attrs.text = content.text() + "\n" + attrs.text;
            attrs.messageId = lastEl.attr("data-message-id");
            lastEl.remove();
          }
          var el = templating.sub("chat-message", {
            peer: attrs.peer,
            content: attrs.text,
            date: date
          });
          linkify(el.find(".togetherjs-chat-content"));
          el.attr("data-person", attrs.peer.id)
            .attr("data-date", date)
            .attr("data-message-id", attrs.messageId);
          ui.chat.add(el, attrs.messageId, attrs.notify);
        },
    
        joinedSession: function (attrs) {
          assert(attrs.peer);
          var date = attrs.date || Date.now();
          var el = templating.sub("chat-joined", {
            peer: attrs.peer,
            date: date
          });
          // FIXME: should bind the notification to the dock location
          ui.chat.add(el, attrs.peer.className("join-message-"), 4000);
        },
    
        leftSession: function (attrs) {
          assert(attrs.peer);
          var date = attrs.date || Date.now();
          var el = templating.sub("chat-left", {
            peer: attrs.peer,
            date: date,
            declinedJoin: attrs.declinedJoin
          });
          // FIXME: should bind the notification to the dock location
          ui.chat.add(el, attrs.peer.className("join-message-"), 4000);
        },
    
        system: function (attrs) {
          assert(! attrs.peer);
          assert(typeof attrs.text == "string");
          var date = attrs.date || Date.now();
          var el = templating.sub("chat-system", {
            content: attrs.text,
            date: date
          });
          ui.chat.add(el, undefined, true);
        },
    
        clear: deferForContainer(function () {
          var container = ui.container.find("#togetherjs-chat-messages");
          container.empty();
        }),
    
        urlChange: function (attrs) {
          assert(attrs.peer);
          assert(typeof attrs.url == "string");
          assert(typeof attrs.sameUrl == "boolean");
          var messageId = attrs.peer.className("url-change-");
          // FIXME: duplicating functionality in .add():
          var realId = "togetherjs-chat-" + messageId;
          var date = attrs.date || Date.now();
          var title;
          // FIXME: strip off common domain from msg.url?  E.g., if I'm on
          // http://example.com/foobar, and someone goes to http://example.com/baz then
          // show only /baz
          // FIXME: truncate long titles
          if (attrs.title) {
            title = attrs.title + " (" + attrs.url + ")";
          } else {
            title = attrs.url;
          }
          var el = templating.sub("url-change", {
            peer: attrs.peer,
            date: date,
            href: attrs.url,
            title: title,
            sameUrl: attrs.sameUrl
          });
          el.find(".togetherjs-nudge").click(function () {
            attrs.peer.nudge();
            return false;
          });
          el.find(".togetherjs-follow").click(function () {
            var url = attrs.peer.url;
            if (attrs.peer.urlHash) {
              url += attrs.peer.urlHash;
            }
            location.href = url;
          });
          var notify = ! attrs.sameUrl;
          if (attrs.sameUrl && ! $("#" + realId).length) {
            // Don't bother showing a same-url notification, if no previous notification
            // had been shown
            return;
          }
          ui.chat.add(el, messageId, notify);
        },
    
        invite: function (attrs) {
          assert(attrs.peer);
          assert(typeof attrs.url == "string");
          var messageId = attrs.peer.className("invite-");
          var date = attrs.date || Date.now();
          var hrefTitle = attrs.url.replace(/\#?&togetherjs=.*/, "").replace(/^\w+:\/\//, "");
          var el = templating.sub("invite", {
            peer: attrs.peer,
            date: date,
            href: attrs.url,
            hrefTitle: hrefTitle,
            forEveryone: attrs.forEveryone
          });
          if (attrs.forEveryone) {
            el.find("a").click(function () {
              // FIXME: hacky way to do this:
              chat.submit("Followed link to " + attrs.url);
            });
          }
          ui.chat.add(el, messageId, true);
        },
    
        hideTimeout: null,
    
        add: deferForContainer(function (el, id, notify) {
          if (id) {
            el.attr("id", "togetherjs-chat-" + util.safeClassName(id));
          }
          var container = ui.container.find("#togetherjs-chat-messages");
          assert(container.length);
          var popup = ui.container.find("#togetherjs-chat-notifier");
          container.append(el);
          ui.chat.scroll();
          var doNotify = !! notify;
          var section = popup.find("#togetherjs-chat-notifier-message");
          if (notify && visibilityApi.hidden()) {
            ui.container.find("#togetherjs-notification")[0].play();
          }
          if (id && section.data("message-id") == id) {
            doNotify = true;
          }
          if (container.is(":visible")) {
            doNotify = false;
          }
          if (doNotify) {
            section.empty();
            section.append(el.clone(true, true));
            if (section.data("message-id") != id)  {
              section.data("message-id", id || "");
              windowing.show(popup);
            } else if (! popup.is(":visible")) {
              windowing.show(popup);
            }
            if (typeof notify == "number") {
              // This is the amount of time we're supposed to notify
              if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
              }
              this.hideTimeout = setTimeout((function () {
                windowing.hide(popup);
                this.hideTimeout = null;
              }).bind(this), notify);
            }
          }
        }),
    
        scroll: deferForContainer(function () {
          var container = ui.container.find("#togetherjs-chat-messages")[0];
          container.scrollTop = container.scrollHeight;
        })
    
      };
    
      session.on("display-window", function (id, win) {
        if (id == "togetherjs-chat") {
          ui.chat.scroll();
          windowing.hide("#togetherjs-chat-notifier");
          $("#togetherjs-window-pointer").show();
        }
      });
    
      /* This class is bound to peers.Peer instances as peer.view.
         The .update() method is regularly called by peer objects when info changes. */
      ui.PeerView = util.Class({
    
        constructor: function (peer) {
          assert(peer.isSelf !== undefined, "PeerView instantiated with non-Peer object");
          this.peer = peer;
          this.dockClick = this.dockClick.bind(this);
        },
    
        /* Takes an element and sets any person-related attributes on the element
           Different from updates, which use the class names we set here: */
        setElement: function (el) {
          var count = 0;
          var classes = ["togetherjs-person", "togetherjs-person-status",
                         "togetherjs-person-name", "togetherjs-person-name-abbrev",
                         "togetherjs-person-bgcolor", "togetherjs-person-swatch",
                         "togetherjs-person-status", "togetherjs-person-role",
                         "togetherjs-person-url", "togetherjs-person-url-title",
                         "togetherjs-person-bordercolor"];
          classes.forEach(function (cls) {
            var els = el.find("." + cls);
            els.addClass(this.peer.className(cls + "-"));
            count += els.length;
          }, this);
          if (! count) {
            console.warn("setElement(", el, ") doesn't contain any person items");
          }
          this.updateDisplay(el);
        },
    
        updateDisplay: deferForContainer(function (container) {
          container = container || ui.container;
          var abbrev = this.peer.name;
          if (this.peer.isSelf) {
            abbrev = "me";
          }
          container.find("." + this.peer.className("togetherjs-person-name-")).text(this.peer.name || "");
          container.find("." + this.peer.className("togetherjs-person-name-abbrev-")).text(abbrev);
          var avatarEl = container.find("." + this.peer.className("togetherjs-person-"));
          if (this.peer.avatar) {
            util.assertValidUrl(this.peer.avatar);
            avatarEl.css({
              backgroundImage: "url(" + this.peer.avatar + ")"
            });
          }
          if (this.peer.idle == "inactive") {
            avatarEl.addClass("togetherjs-person-inactive");
          } else {
            avatarEl.removeClass("togetherjs-person-inactive");
          }
          avatarEl.attr("title", this.peer.name);
          if (this.peer.color) {
            avatarEl.css({
              borderColor: this.peer.color
            });
            avatarEl.find(".togetherjs-person-avatar-swatch").css({
              borderTopColor: this.peer.color,
              borderRightColor: this.peer.color
            });
          }
          if (this.peer.color) {
            var colors = container.find("." + this.peer.className("togetherjs-person-bgcolor-"));
            colors.css({
              backgroundColor: this.peer.color
            });
            colors = container.find("." + this.peer.className("togetherjs-person-bordercolor-"));
            colors.css({
              borderColor: this.peer.color
            });
          }
          container.find("." + this.peer.className("togetherjs-person-role-"))
            .text(this.peer.isCreator ? "Creator" : "Participant");
          var urlName = this.peer.title || "";
          if (this.peer.title) {
            urlName += " (";
          }
          urlName += util.truncateCommonDomain(this.peer.url, location.href);
          if (this.peer.title) {
            urlName += ")";
          }
          container.find("." + this.peer.className("togetherjs-person-url-title-"))
            .text(urlName);
          var url = this.peer.url;
          if (this.peer.urlHash) {
            url += this.peer.urlHash;
          }
          container.find("." + this.peer.className("togetherjs-person-url-"))
            .attr("href", url);
          // FIXME: should have richer status:
          container.find("." + this.peer.className("togetherjs-person-status-"))
            .text(this.peer.idle == "active" ? "Active" : "Inactive");
          if (this.peer.isSelf) {
            // FIXME: these could also have consistent/reliable class names:
            var selfName = $(".togetherjs-self-name");
            selfName.each((function (index, el) {
              el = $(el);
              if (el.val() != this.peer.name) {
                el.val(this.peer.name);
              }
            }).bind(this));
            $("#togetherjs-menu-avatar").attr("src", this.peer.avatar);
            if (! this.peer.name) {
              $("#togetherjs-menu .togetherjs-person-name-self").text(this.peer.defaultName);
            }
          }
          if (this.peer.url != session.currentUrl()) {
            container.find("." + this.peer.className("togetherjs-person-"))
                .addClass("togetherjs-person-other-url");
          } else {
            container.find("." + this.peer.className("togetherjs-person-"))
                .removeClass("togetherjs-person-other-url");
          }
          if (this.peer.following) {
            if (this.followCheckbox) {
              this.followCheckbox.prop("checked", true);
            }
          } else {
            if (this.followCheckbox) {
              this.followCheckbox.prop("checked", false);
            }
          }
          // FIXME: add some style based on following?
          updateChatParticipantList();
          this.updateFollow();
        }),
    
        update: function () {
          if (! this.peer.isSelf) {
            if (this.peer.status == "live") {
              this.dock();
            } else {
              this.undock();
            }
          }
          this.updateDisplay();
          this.updateUrlDisplay();
        },
    
        updateUrlDisplay: function (force) {
          var url = this.peer.url;
          if ((! url) || (url == this._lastUpdateUrlDisplay && ! force)) {
            return;
          }
          this._lastUpdateUrlDisplay = url;
          var sameUrl = url == session.currentUrl();
          ui.chat.urlChange({
            peer: this.peer,
            url: this.peer.url,
            title: this.peer.title,
            sameUrl: sameUrl
          });
        },
    
        urlNudge: function () {
          // FIXME: do something more distinct here
          this.updateUrlDisplay(true);
        },
    
        notifyJoined: function () {
          ui.chat.joinedSession({
            peer: this.peer
          });
        },
    
        // when there are too many participants in the dock, consolidate the participants to one avatar, and on mouseOver, the dock expands down to reveal the rest of the participants
        // if there are X users in the session
        // then hide the users in the dock
        // and shrink the size of the dock
        // and if you rollover the dock, it expands and reveals the rest of the participants in the dock
    
        //if users hit X then show the participant button with the consol
    
        dock: deferForContainer(function () {
          if (this.dockElement) {
            return;
          }
          this.dockElement = templating.sub("dock-person", {
            peer: this.peer
          });
          this.dockElement.attr("id", this.peer.className("togetherjs-dock-element-"));
          ui.container.find("#togetherjs-dock-participants").append(this.dockElement);
          this.dockElement.find(".togetherjs-person").animateDockEntry();
          const numberOfUsers = peers.getAllPeers(true).length;
          if (numberOfUsers > 4) {
            $("#togetherjs-dock-participants .togetherjs-dock-person:not(:first-of-type").each(function () {
              this.style.setProperty("--offset", (((numberOfUsers - 4) * -BUTTON_HEIGHT) / (numberOfUsers - 1)) + "px")
            })
            const persons = $("#togetherjs-dock-participants")
            if (!persons[0].hasListener) {
              persons.mouseenter(adjustDockPos)
              persons.mouseleave(adjustDockPos)
              persons[0].hasListener = true
            }
          }
          adjustDockPos();
          this.detailElement = templating.sub("participant-window", {
            peer: this.peer
          });
          var followId = this.peer.className("togetherjs-person-status-follow-");
          this.detailElement.find('[for="togetherjs-person-status-follow"]').attr("for", followId);
          this.detailElement.find('#togetherjs-person-status-follow').attr("id", followId);
          this.detailElement.find(".togetherjs-follow").click(function () {
            location.href = $(this).attr("href");
          });
          this.detailElement.find(".togetherjs-nudge").click((function () {
            this.peer.nudge();
          }).bind(this));
          this.followCheckbox = this.detailElement.find("#" + followId);
          this.followCheckbox.change(function () {
            if (! this.checked) {
              this.peer.unfollow();
            }
            // Following doesn't happen until the window is closed
            // FIXME: should we tell the user this?
          });
          this.maybeHideDetailWindow = this.maybeHideDetailWindow.bind(this);
          session.on("hide-window", this.maybeHideDetailWindow);
          $("#togetherjs-feedback-form").after(this.detailElement);
          this.dockElement.click((function () {
            if (this.detailElement.is(":visible")) {
              windowing.hide(this.detailElement);
            } else {
              windowing.show(this.detailElement, {bind: this.dockElement});
              this.scrollTo();
              this.cursor().element.animate({
                opacity:0.3
              }).animate({
                opacity:1
              }).animate({
                opacity:0.3
              }).animate({
                opacity:1
              });
            }
          }).bind(this));
          this.updateFollow();
        }),
    
        undock: function () {
          if (! this.dockElement) {
            return;
          }
          if (peers.getAllPeers(true).length <= 4) {
            $("#togetherjs-dock-participants .togetherjs-dock-person:not(:first-of-type").each(function () {
              this.style.removeProperty("--offset")
            })
            const persons = $("#togetherjs-dock-participants")
            if (persons[0].hasListener) {
              persons.off("mouseenter")
              persons.off("mouseleave")
              delete persons[0].hasListener
            }
          }
          this.dockElement.find(".togetherjs-person").animateDockExit().promise().then((function () {
            this.dockElement.remove();
            this.dockElement = null;
            this.detailElement.remove();
            this.detailElement = null;
            adjustDockPos();
          }).bind(this));
        },
    
        scrollTo: function () {
          if (this.peer.url != session.currentUrl()) {
            return;
          }
          var pos = this.peer.scrollPosition;
          if (! pos) {
            console.warn("Peer has no scroll position:", this.peer);
            return;
          }
          pos = elementFinder.pixelForPosition(pos);
          $("html, body").easeTo(pos);
        },
    
        updateFollow: function () {
          if (! this.peer.url) {
            return;
          }
          if (! this.detailElement) {
            return;
          }
          var same = this.detailElement.find(".togetherjs-same-url");
          var different = this.detailElement.find(".togetherjs-different-url");
          if (this.peer.url == session.currentUrl()) {
            same.show();
            different.hide();
          } else {
            same.hide();
            different.show();
          }
        },
    
        maybeHideDetailWindow: function (windows) {
          if (this.detailElement && windows[0] && windows[0][0] === this.detailElement[0]) {
            if (this.followCheckbox[0].checked) {
              this.peer.follow();
            } else {
              this.peer.unfollow();
            }
          }
        },
    
        dockClick: function () {
          // FIXME: scroll to person
        },
    
        cursor: function () {
          return require("cursor").getClient(this.peer.id);
        },
    
        destroy: function () {
          // FIXME: should I get rid of the dockElement?
          session.off("hide-window", this.maybeHideDetailWindow);
        }
      });
    
      function updateChatParticipantList() {
        var live = peers.getAllPeers(true);
        if (live.length) {
          ui.displayToggle("#togetherjs-chat-participants");
          $("#togetherjs-chat-participant-list").text(
            live.map(function (p) {return p.name;}).join(", "));
        } else {
          ui.displayToggle("#togetherjs-chat-no-participants");
        }
      }
    
      function inviteHubUrl() {
        var base = TogetherJS.config.get("inviteFromRoom");
        assert(base);
        return util.makeUrlAbsolute(base, session.hubUrl());
      }
    
      var inRefresh = false;
    
      function refreshInvite() {
        if (inRefresh) {
          return;
        }
        inRefresh = true;
        require(["who"], function (who) {
          var def = who.getList(inviteHubUrl());
          function addUser(user, before) {
            var item = templating.sub("invite-user-item", {peer: user});
            item.attr("data-clientid", user.id);
            if (before) {
              item.insertBefore(before);
            } else {
              $("#togetherjs-invite-users").append(item);
            }
            item.click(function() {
              invite(user.clientId);
            });
          }
          function refresh(users, finished) {
            var sorted = [];
            for (var id in users) {
              if (users.hasOwnProperty(id)) {
                sorted.push(users[id]);
              }
            }
            sorted.sort(function (a, b) {
              return a.name < b.name ? -1 : 1;
            });
            var pos = 0;
            ui.container.find("#togetherjs-invite-users .togetherjs-menu-item").each(function () {
              var $this = $(this);
              if (finished && ! users[$this.attr("data-clientid")]) {
                $this.remove();
                return;
              }
              if (pos >= sorted.length) {
                return;
              }
              while (pos < sorted.length && $this.attr("data-clientid") !== sorted[pos].id) {
                addUser(sorted[pos], $this);
                pos++;
              }
              while (pos < sorted.length && $this.attr("data-clientid") == sorted[pos].id) {
                pos++;
              }
            });
            for (var i=pos; i<sorted.length; i++) {
              addUser(sorted[pos]);
            }
          }
          def.then(function (users) {
            refresh(users, true);
            inRefresh = false;
          });
          def.progress(refresh);
        });
      }
    
      session.hub.on("invite", function (msg) {
        if (msg.forClientId && msg.clientId != peers.Self.id) {
          return;
        }
        require(["who"], function (who) {
          var peer = who.ExternalPeer(msg.userInfo.clientId, msg.userInfo);
          ui.chat.invite({peer: peer, url: msg.url, forEveryone: ! msg.forClientId});
        });
      });
    
      function invite(clientId) {
        require(["who"], function (who) {
          // FIXME: use the return value of this to give a signal that
          // the invite has been successfully sent:
          who.invite(inviteHubUrl(), clientId).then(function () {
            hideMenu();
          });
        });
      }
    
      ui.showUrlChangeMessage = deferForContainer(function (peer, url) {
        var window = templating.sub("url-change", {peer: peer});
        ui.container.append(window);
        windowing.show(window);
      });
    
      session.hub.on("url-change-nudge", function (msg) {
        if (msg.to && msg.to != session.clientId) {
          // Not directed to us
          return;
        }
        msg.peer.urlNudge();
      });
    
      session.on("new-element", function (el) {
        if (TogetherJS.config.get("toolName")) {
          ui.updateToolName(el);
        }
      });
    
      var setToolName = false;
      ui.updateToolName = function (container) {
        container = container || $(document.body);
        var name = TogetherJS.config.get("toolName");
        if (setToolName && ! name) {
          name = "TogetherJS";
        }
        if (name) {
          container.find(".togetherjs-tool-name").text(name);
          setToolName = true;
        }
      };
    
      TogetherJS.config.track("toolName", function (name) {
        ui.updateToolName(ui.container);
      });
    
      return ui;
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('playback',["jquery", "util", "session", "storage", "require"], function ($, util, session, storage, require) {
      var playback = util.Module("playback");
      var assert = util.assert;
    
      var ALWAYS_REPLAY = {
        "cursor-update": true,
        "scroll-update": true
      };
    
      playback.getLogs = function (url) {
        if (url.search(/^local:/) === 0) {
          return $.Deferred(function (def) {
            storage.get("recording." + url.substr("local:".length)).then(function (logs) {
              if (! logs) {
                def.resolve(null);
                return;
              }
              logs = parseLogs(logs);
              def.resolve(logs);
            }, function (error) {
              def.reject(error);
            });
          });
        }
        return $.Deferred(function (def) {
          $.ajax({
            url: url,
            dataType: "text"
          }).then(
            function (logs) {
              logs = parseLogs(logs);
              def.resolve(logs);
            },
            function (error) {
              def.reject(error);
            });
        });
      };
    
      function parseLogs(logs) {
        logs = logs.replace(/\r\n/g, '\n');
        logs = logs.split(/\n/g);
        var result = [];
        for (var i=0; i<logs.length; i++) {
          var line = logs[i];
          line = line.replace(/^\s+/, "").replace(/\s+$/, "");
          if (line.search(/\/\*/) === 0) {
            var last = line.search(/\*\//);
            if (last == -1) {
              console.warn("bad line:", line);
              continue;
            }
            line = line.substr(last+2);
          }
          line = line.replace(/^\s+/, "");
          if (! line) {
            continue;
          }
          line = JSON.parse(line);
          result.push(line);
        }
        return Logs(result);
      }
    
      var Logs = util.Class({
        constructor: function (logs, fromStorage) {
          this.logs = logs;
          this.fromStorage = fromStorage;
          this.pos = 0;
        },
    
        play: function () {
          this.start = Date.now();
          if (this.pos >= this.logs.length) {
            this.unload();
            return;
          }
          if (this.pos !== 0) {
            // First we need to play the hello
            var toReplay = [];
            var foundHello = false;
            for (var i=this.pos-1; i>=0; i--) {
              var item = this.logs[i];
              if (ALWAYS_REPLAY[item.type]) {
                toReplay.push(item);
              }
              if (item.type == "hello" || item.type == "hello-back") {
                this.playItem(item);
                foundHello = true;
                break;
              }
            }
            if (! foundHello) {
              console.warn("No hello message found before position", this.pos);
            }
            toReplay.reverse();
            for (i=0; i<toReplay.length; i++) {
              this.playItem(toReplay[i]);
            }
          }
          this.playOne();
        },
    
        cancel: function () {
          if (this.playTimer) {
            clearTimeout(this.playTimer);
            this.playTimer = null;
          }
          this.start = null;
          this.pos = 0;
          this.unload();
        },
    
        pause: function () {
          if (this.playTimer) {
            clearTimeout(this.playTimer);
            this.playTimer = null;
          }
        },
    
        playOne: function () {
          this.playTimer = null;
          if (this.pos >= this.logs.length) {
            this.unload();
            return;
          }
          var item = this.logs[this.pos];
          this.playItem(item);
          this.pos++;
          if (this.pos >= this.logs.length) {
            this.unload();
            return;
          }
          var next = this.logs[this.pos];
          var pause = next.date - item.date;
          this.playTimer = setTimeout(this.playOne.bind(this), pause);
          if (this.fromStorage) {
            this.savePos();
          }
        },
    
        playItem: function (item) {
          if (item.type == "hello") {
            // We may need to pause here
            if (item.url != (location.href+"").replace(/\#.*/, "")) {
              this.pause();
            }
          }
          try {
            session._getChannel().onmessage(item);
          } catch (e) {
            console.warn("Could not play back message:", item, "error:", e);
          }
        },
    
        save: function () {
          this.fromStorage = true;
          storage.set("playback.logs", this.logs);
          this.savePos();
        },
    
        savePos: function () {
          storage.set("playback.pos", this.pos);
        },
    
        unload: function () {
          if (this.fromStorage) {
            storage.set("playback.logs", undefined);
            storage.set("playback.pos", undefined);
          }
          // FIXME: should do a bye message here
        }
    
      });
    
      playback.getRunningLogs = function () {
        return storage.get("playback.logs").then(function (value) {
          if (! value) {
            return null;
          }
          var logs = Logs(value, true);
          return storage.get("playback.pos").then(function (pos) {
            pos = pos || 0;
            logs.pos = pos;
            return logs;
          });
        });
      };
    
      return playback;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    /*jshint evil:true */
    define('chat',["require", "jquery", "util", "session", "ui", "templates", "playback", "storage", "peers", "windowing"], function (require, $, util, session, ui, templates, playback, storage, peers, windowing) {
      var chat = util.Module("chat");
      var assert = util.assert;
      var Walkabout;
    
      session.hub.on("chat", function (msg) {
        ui.chat.text({
          text: msg.text,
          peer: msg.peer,
          // FIXME: a little unsure of trusting this (maybe I should prefix it?)
          messageId: msg.messageId,
          notify: true
        });
        saveChatMessage({
          text: msg.text,
          date: Date.now(),
          peerId: msg.peer.id,
          messageId: msg.messageId
        });
      });
    
      // FIXME: this doesn't really belong in this module:
      session.hub.on("bye", function (msg) {
        ui.chat.leftSession({
          peer: msg.peer,
          declinedJoin: msg.reason == "declined-join"
        });
      });
    
      chat.submit = function (message) {
        var parts = message.split(/ /);
        if (parts[0].charAt(0) == "/") {
          var name = parts[0].substr(1).toLowerCase();
          var method = commands["command_" + name];
          if (method) {
            method.apply(null, parts.slice(1));
            return;
          }
        }
        var messageId = session.clientId + "-" + Date.now();
        session.send({
          type: "chat",
          text: message,
          messageId: messageId
        });
        ui.chat.text({
          text: message,
          peer: peers.Self,
          messageId: messageId,
          notify: false
        });
        saveChatMessage({
          text: message,
          date: Date.now(),
          peerId: peers.Self.id,
          messageId: messageId
        });
      };
    
      var commands = {
        command_help: function () {
          var msg = util.trim(templates.help);
          ui.chat.system({
            text: msg
          });
        },
    
        command_test: function (args) {
          if (! Walkabout) {
            require(["walkabout"], (function (WalkaboutModule) {
              Walkabout = WalkaboutModule;
              this.command_test(args);
            }).bind(this));
            return;
          }
          args = util.trim(args || "").split(/\s+/g);
          if (args[0] === "" || ! args.length) {
            if (this._testCancel) {
              args = ["cancel"];
            } else {
              args = ["start"];
            }
          }
          if (args[0] == "cancel") {
            ui.chat.system({
              text: "Aborting test"
            });
            this._testCancel();
            this._testCancel = null;
            return;
          }
          if (args[0] == "start") {
            var times = parseInt(args[1], 10);
            if (isNaN(times) || ! times) {
              times = 100;
            }
            ui.chat.system({
              text: "Testing with walkabout.js"
            });
            var tmpl = $(templates.walkabout);
            var container = ui.container.find(".togetherjs-test-container");
            container.empty();
            container.append(tmpl);
            container.show();
            var statusContainer = container.find(".togetherjs-status");
            statusContainer.text("starting...");
            this._testCancel = Walkabout.runManyActions({
              ondone: function () {
                statusContainer.text("done");
                statusContainer.one("click", function () {
                  container.hide();
                });
                this._testCancel = null;
              },
              onstatus: function (status) {
                var note = "actions: " + status.actions.length + " running: " +
                  (status.times - status.remaining) + " / " + status.times;
                statusContainer.text(note);
              }
            });
            return;
          }
          if (args[0] == "show") {
            if (this._testShow.length) {
              this._testShow.forEach(function (item) {
                if (item) {
                  item.remove();
                }
              }, this);
              this._testShow = [];
            } else {
              var actions = Walkabout.findActions();
              actions.forEach(function (action) {
                this._testShow.push(action.show());
              }, this);
            }
            return;
          }
          if (args[0] == "describe") {
            Walkabout.findActions().forEach(function (action) {
              ui.chat.system({
                text: action.description()
              });
            }, this);
            return;
          }
          ui.chat.system({
            text: "Did not understand: " + args.join(" ")
          });
        },
    
        _testCancel: null,
        _testShow: [],
    
        command_clear: function () {
          ui.chat.clear();
        },
    
        command_exec: function () {
          var expr = Array.prototype.slice.call(arguments).join(" ");
          var result;
          // We use this to force global eval (not in this scope):
          var e = eval;
          try {
            result = e(expr);
          } catch (error) {
            ui.chat.system({
              text: "Error: " + error
            });
          }
          if (result !== undefined) {
            ui.chat.system({
              text: "" + result
            });
          }
        },
    
        command_record: function () {
          ui.chat.system({
            text: "When you see the robot appear, the recording will have started"
          });
          window.open(
            session.recordUrl(), "_blank",
            "left,width=" + ($(window).width() / 2));
        },
    
        playing: null,
    
        command_playback: function (url) {
          if (this.playing) {
            this.playing.cancel();
            this.playing.unload();
            this.playing = null;
            ui.chat.system({
              text: "playback cancelled"
            });
            return;
          }
          if (! url) {
            ui.chat.system({
              text: "Nothing is playing"
            });
            return;
          }
          var logLoader = playback.getLogs(url);
          logLoader.then(
            (function (logs) {
              if (! logs) {
                ui.chat.system({
                  text: "No logs found."
                });
                return;
              }
              logs.save();
              this.playing = logs;
              logs.play();
            }).bind(this),
            function (error) {
              ui.chat.system({
                text: "Error fetching " + url + ":\n" + JSON.stringify(error, null, "  ")
              });
            });
          windowing.hide("#togetherjs-chat");
        },
    
        command_savelogs: function (name) {
          session.send({
            type: "get-logs",
            forClient: session.clientId,
            saveAs: name
          });
          function save(msg) {
            if (msg.request.forClient == session.clientId && msg.request.saveAs == name) {
              storage.set("recording." + name, msg.logs).then(function () {
                session.hub.off("logs", save);
                ui.chat.system({
                  text: "Saved as local:" + name
                });
              });
            }
          }
          session.hub.on("logs", save);
        },
    
        command_baseurl: function (url) {
          if (! url) {
            storage.get("baseUrlOverride").then(function (b) {
              if (b) {
                ui.chat.system({
                  text: "Set to: " + b.baseUrl
                });
              } else {
                ui.chat.system({
                  text: "No baseUrl override set"
                });
              }
            });
            return;
          }
          url = url.replace(/\/*$/, "");
          ui.chat.system({
            text: "If this goes wrong, do this in the console to reset:\n  localStorage.setItem('togetherjs.baseUrlOverride', null)"
          });
          storage.set("baseUrlOverride", {
            baseUrl: url,
            expiresAt: Date.now() + (1000 * 60 * 60 * 24)
          }).then(function () {
            ui.chat.system({
              text: "baseUrl overridden (to " + url + "), will last for one day."
            });
          });
        },
    
        command_config: function (variable, value) {
          if (! (variable || value)) {
            storage.get("configOverride").then(function (c) {
              if (c) {
                util.forEachAttr(c, function (value, attr) {
                  if (attr == "expiresAt") {
                    return;
                  }
                  ui.chat.system({
                    text: "  " + attr + " = " + JSON.stringify(value)
                  });
                });
                ui.chat.system({
                  text: "Config expires at " + (new Date(c.expiresAt))
                });
              } else {
                ui.chat.system({
                  text: "No config override"
                });
              }
            });
            return;
          }
          if (variable == "clear") {
            storage.set("configOverride", undefined);
            ui.chat.system({
              text: "Clearing all overridden configuration"
            });
            return;
          }
          //console.log("config", [variable, value]);
          if (! (variable && value)) {
            ui.chat.system({
              text: "Error: must provide /config VAR VALUE"
            });
            return;
          }
          try {
            value = JSON.parse(value);
          } catch (e) {
            ui.chat.system({
              text: "Error: value (" + value + ") could not be parsed: " + e
            });
            return;
          }
          if (! TogetherJS._defaultConfiguration.hasOwnProperty(variable)) {
            ui.chat.system({
              text: "Warning: variable " + variable + " is unknown"
            });
          }
          storage.get("configOverride").then(function (c) {
            c = c || {};
            c[variable] = value;
            c.expiresAt = Date.now() + (1000 * 60 * 60 * 24);
            storage.set("configOverride", c).then(function () {
              ui.chat.system({
                text: "Variable " + variable + " = " + JSON.stringify(value) + "\nValue will be set for one day."
              });
            });
          });
        }
    
      };
    
      // this section deal with saving/restoring chat history as long as session is alive
      var chatStorageKey = "chatlog";
      var maxLogMessages = 100;
    
      function saveChatMessage(obj) {
        assert(obj.peerId);
        assert(obj.messageId);
        assert(obj.date);
        assert(typeof obj.text == "string");
    
        loadChatLog().then(function (log) {
          for (var i = log.length - 1; i >= 0; i--) {
            if (log[i].messageId === obj.messageId) {
              return;
            }
          }
          log.push(obj);
          if (log.length > maxLogMessages) {
            log.splice(0, log.length - maxLogMessages);
          }
          storage.tab.set(chatStorageKey, log);
        });
      }
    
      function loadChatLog() {
        return storage.tab.get(chatStorageKey, []);
      }
    
      session.once("ui-ready", function () {
        loadChatLog().then(function (log) {
          if (! log) {
            return;
          }
          for (var i = 0; i < log.length; i++) {
            // peers should already be loaded from sessionStorage by the peers module
            // maybe i should use a try catch block here
            var currentPeer = peers.getPeer(log[i].peerId);
            ui.chat.text({
              text: log[i].text,
              date: log[i].date,
              peer: currentPeer,
              messageId: log[i].messageId
            });
          }
        });
      });
      //delete chat log
      session.on("close", function(){
        storage.tab.set(chatStorageKey, undefined);
      });
    
      return chat;
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    define('console',["util"], function (util) {
    
      var console = window.console || {log: function () {}};
    
      var Console = util.Class({
        constructor: function () {
          this.messages = [];
          this.level = this.levels.log;
        },
    
        messageLimit: 100,
    
        levels: {
          debug: 1,
          // FIXME: I'm considering *not* wrapping console.log, and strictly keeping
          // it as a debugging tool; also line numbers would be preserved
          log: 2,
          info: 3,
          notify: 4,
          warn: 5,
          error: 6,
          fatal: 7
        },
    
        // Gets set below:
        maxLevel: 0,
    
        consoleLevels: [
          [],
          console.debug || [],
          console.log || [],
          console.info || [],
          console.notify || [],
          console.warn || [],
          console.error || [],
          console.fatal || []
        ],
    
        levelNames: {},
    
        setLevel: function (l) {
          var number;
          if (typeof l == "string") {
            number = this.levels[l];
            if (number === undefined) {
              throw new Error("Tried to set Console level to unknown level string: " + l);
            }
            l = number;
          }
          if (typeof l == "function") {
            number = this.consoleLevels.indexOf(l);
            if (number == -1) {
              throw new Error("Tried to set Console level based on unknown console function: " + l);
            }
            l = number;
          }
          if (typeof l == "number") {
            if (l < 0) {
              throw new Error("Console level must be 0 or larger: " + l);
            } else if (l > this.maxLevel) {
              throw new Error("Console level must be " + this.maxLevel + " or smaller: " + l);
            }
          }
          this.level = l;
        },
    
        write: function (level) {
          try {
            this.messages.push([
              Date.now(),
              level,
              this._stringify(Array.prototype.slice.call(arguments, 1))
            ]);
          } catch (e) {
            console.warn("Error stringifying argument:", e);
          }
          if (level != "suppress" && this.level <= level) {
            var method = console[this.levelNames[level]];
            if (! method) {
              method = console.log;
            }
            method.apply(console, Array.prototype.slice.call(arguments, 1));
          }
        },
    
        suppressedWrite: function () {
          this.write.apply(this, ["suppress"].concat(Array.prototype.slice.call(arguments)));
        },
    
        trace: function (level) {
          level = level || 'log';
          if (console.trace) {
            level = "suppressedWrite";
          }
          try {
            throw new Error();
          } catch (e) {
            // FIXME: trim this frame
            var stack = e.stack;
            stack = stack.replace(/^[^\n]*\n/, "");
            this[level](stack);
          }
          if (console.trace) {
            console.trace();
          }
        },
    
        _browserInfo: function () {
          // FIXME: add TogetherJS version and
          return [
            "TogetherJS base URL: " + TogetherJS.baseUrl,
            "User Agent: " + navigator.userAgent,
            "Page loaded: " + this._formatDate(TogetherJS.pageLoaded),
            "Age: " + this._formatMinutes(Date.now() - TogetherJS.pageLoaded) + " minutes",
            // FIXME: make this right:
            //"Window: height: " + window.screen.height + " width: " + window.screen.width
            "URL: " + location.href,
            "------+------+----------------------------------------------"
          ];
        },
    
        _stringify: function (args) {
          var s = "";
          for (var i=0; i<args.length; i++) {
            if (s) {
              s += " ";
            }
            s += this._stringifyItem(args[i]);
          }
          return s;
        },
    
        _stringifyItem: function (item) {
          if (typeof item == "string") {
            if (item === "") {
              return '""';
            }
            return item;
          }
          if (typeof item == "object" && item.repr) {
            try {
              return item.repr();
            } catch (e) {
              console.warn("Error getting object repr:", item, e);
            }
          }
          if (item !== null && typeof item == "object") {
            // FIXME: this can drop lots of kinds of values, like a function or undefined
            item = JSON.stringify(item);
          }
          return item.toString();
        },
    
        _formatDate: function (timestamp) {
          return (new Date(timestamp)).toISOString();
        },
    
        _formatTime: function (timestamp) {
          return ((timestamp - TogetherJS.pageLoaded) / 1000).toFixed(2);
        },
    
        _formatMinutes: function (milliseconds) {
          var m = Math.floor(milliseconds / 1000 / 60);
          var remaining = milliseconds - (m * 1000 * 60);
          if (m > 10) {
            // Over 10 minutes, just ignore the seconds
            return m;
          }
          var seconds = Math.floor(remaining / 1000) + "";
          m += ":";
          seconds = lpad(seconds, 2, "0");
          m += seconds;
          if (m == "0:00") {
            m += ((remaining / 1000).toFixed(3) + "").substr(1);
          }
          return m;
        },
    
        _formatLevel: function (l) {
          if (l === "suppress") {
            return "";
          }
          return this.levelNames[l];
        },
    
        toString: function () {
          try {
            var lines = this._browserInfo();
            this.messages.forEach(function (m) {
              lines.push(lpad(this._formatTime(m[0]), 6) + " " + rpad(this._formatLevel(m[1]), 6) + " " + lpadLines(m[2], 14));
            }, this);
            return lines.join("\n");
          } catch (e) {
            // toString errors can otherwise be swallowed:
            console.warn("Error running console.toString():", e);
            throw e;
          }
        },
    
        submit: function (options) {
          // FIXME: friendpaste is broken for this
          // (and other pastebin sites aren't really Browser-accessible)
          return util.Deferred(function (def) {
            options = options || {};
            var site = options.site || TogetherJS.config.get("pasteSite") || "https://www.friendpaste.com/";
            var req = new XMLHttpRequest();
            req.open("POST", site);
            req.setRequestHeader("Content-Type", "application/json");
            req.send(JSON.stringify({
              "title": options.title || "TogetherJS log file",
              "snippet": this.toString(),
              "language": "text"
            }));
            req.onreadystatechange = function () {
              if (req.readyState === 4) {
                var data = JSON.parse(req.responseText);
              }
            };
          });
        }
    
      });
    
      function rpad(s, len, pad) {
        s = s + "";
        pad = pad || " ";
        while (s.length < len) {
          s += pad;
        }
        return s;
      }
    
      function lpad(s, len, pad) {
        s = s + "";
        pad = pad || " ";
        while (s.length < len) {
          s = pad + s;
        }
        return s;
      }
    
      function lpadLines(s, len, pad) {
        var i;
        s = s + "";
        if (s.indexOf("\n") == -1) {
          return s;
        }
        pad = pad || " ";
        var fullPad = "";
        for (i=0; i<len; i++) {
          fullPad += pad;
        }
        s = s.split(/\n/g);
        for (i=1; i<s.length; i++) {
          s[i] = fullPad + s[i];
        }
        return s.join("\n");
      }
    
    
    
      // This is a factory that creates `Console.prototype.debug`, `.error` etc:
      function logFunction(name, level) {
        return function () {
          this.write.apply(this, [level].concat(Array.prototype.slice.call(arguments)));
        };
      }
    
      util.forEachAttr(Console.prototype.levels, function (value, name) {
        Console.prototype[name] = logFunction(name, value);
        Console.prototype.maxLevel = Math.max(Console.prototype.maxLevel, value);
      });
    
      util.forEachAttr(Console.prototype.levels, function (value, name) {
        Console.prototype.levelNames[value] = name;
      });
    
      var appConsole = Console();
    
      appConsole.ConsoleClass = Console;
    
      return appConsole;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('eventMaker',["jquery", "util"], function ($, util) {
      var eventMaker = util.Module("eventMaker");
    
      eventMaker.performClick = function (target) {
        // FIXME: should accept other parameters, like Ctrl/Alt/etc
        var event = document.createEvent("MouseEvents");
        event.initMouseEvent(
          "click", // type
          true, // canBubble
          true, // cancelable
          window, // view
          0, // detail
          0, // screenX
          0, // screenY
          0, // clientX
          0, // clientY
          false, // ctrlKey
          false, // altKey
          false, // shiftKey
          false, // metaKey
          0, // button
          null // relatedTarget
        );
        // FIXME: I'm not sure this custom attribute always propagates?
        // seems okay in Firefox/Chrome, but I've had problems with
        // setting attributes on keyboard events in the past.
        event.togetherjsInternal = true;
        target = $(target)[0];
        var cancelled = target.dispatchEvent(event);
        if (cancelled) {
          return;
        }
        if (target.tagName == "A") {
          var href = target.href;
          if (href) {
            location.href = href;
            return;
          }
        }
        // FIXME: should do button clicks (like a form submit)
        // FIXME: should run .onclick() as well
      };
    
      eventMaker.fireChange = function (target) {
        target = $(target)[0];
        var event = document.createEvent("HTMLEvents");
        event.initEvent("change", true, true);
        target.dispatchEvent(event);
      };
    
      return eventMaker;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    // Cursor viewing support
    
    define('cursor',["jquery", "ui", "util", "session", "elementFinder", "tinycolor", "eventMaker", "peers", "templating"], function ($, ui, util, session, elementFinder, tinycolor, eventMaker, peers, templating) {
      var assert = util.assert;
      var cursor = util.Module("cursor");
    
      var FOREGROUND_COLORS = ["#111", "#eee"];
      var CURSOR_HEIGHT = 50;
      var CURSOR_ANGLE = (35 / 180) * Math.PI;
      var CURSOR_WIDTH = Math.ceil(Math.sin(CURSOR_ANGLE) * CURSOR_HEIGHT);
      // Number of milliseconds after page load in which a scroll-update
      // related hello-back message will be processed:
      var SCROLL_UPDATE_CUTOFF = 2000;
    
      session.hub.on("cursor-update", function (msg) {
        if (msg.sameUrl) {
          Cursor.getClient(msg.clientId).updatePosition(msg);
        } else {
          // FIXME: This should be caught even before the cursor-update message,
          // when the peer goes to another URL
          Cursor.getClient(msg.clientId).hideOtherUrl();
        }
      });
    
      // FIXME: should check for a peer leaving and remove the cursor object
      var Cursor = util.Class({
    
        constructor: function (clientId) {
          this.clientId = clientId;
          this.element = templating.clone("cursor");
          this.elementClass = "togetherjs-scrolled-normal";
          this.element.addClass(this.elementClass);
          this.updatePeer(peers.getPeer(clientId));
          this.lastTop = this.lastLeft = null;
          $(document.body).append(this.element);
          this.element.animateCursorEntry();
          this.keydownTimeout = null;
          this.clearKeydown = this.clearKeydown.bind(this);
          this.atOtherUrl = false;
        },
    
        // How long after receiving a setKeydown call that we should show the
        // user typing.  This should be more than MIN_KEYDOWN_TIME:
        KEYDOWN_WAIT_TIME: 2000,
    
        updatePeer: function (peer) {
          // FIXME: can I use peer.setElement()?
          this.element.css({color: peer.color});
          var img = this.element.find("img.togetherjs-cursor-img");
          img.attr("src", makeCursor(peer.color));
          var name = this.element.find(".togetherjs-cursor-name");
          var nameContainer = this.element.find(".togetherjs-cursor-container");
          assert(name.length);
          name.text(peer.name);
          nameContainer.css({
            backgroundColor: peer.color,
            color: tinycolor.mostReadable(peer.color, FOREGROUND_COLORS)
          });
          var path = this.element.find("svg path");
          path.attr("fill", peer.color);
          // FIXME: should I just remove the element?
          if (peer.status != "live") {
            //this.element.hide();
            this.element.find("svg").animate({
              opacity: 0
            }, 350);
            this.element.find(".togetherjs-cursor-container").animate({
                    width: 34,
                    height: 20,
                    padding: 12,
                    margin: 0
                }, 200).animate({
                    width: 0,
                    height: 0,
                    padding: 0,
                    opacity: 0
                    }, 200);
          } else {
            //this.element.show();
            this.element.animate({
              opacity:0.3
            }).animate({
              opacity:1
            });
          }
        },
    
        setClass: function (name) {
          if (name != this.elementClass) {
            this.element.removeClass(this.elementClass).addClass(name);
            this.elementClass = name;
          }
        },
    
        updatePosition: function (pos) {
          var top, left;
          if (this.atOtherUrl) {
            this.element.show();
            this.atOtherUrl = false;
          }
          if (pos.element) {
            try {
              var target = $(elementFinder.findElement(pos.element));
              var offset = target.offset();
              top = offset.top + pos.offsetY;
              left = offset.left + pos.offsetX;
            } catch (e) {
              if (e instanceof elementFinder.CannotFind) {
                top = pos.top;
                left = pos.left;
              } else
                throw e;
            }
          } else {
            // No anchor, just an absolute position
            top = pos.top;
            left = pos.left;
          }
          // These are saved for use by .refresh():
          this.lastTop = top;
          this.lastLeft = left;
          this.setPosition(top, left);
        },
    
        hideOtherUrl: function () {
          if (this.atOtherUrl) {
            return;
          }
          this.atOtherUrl = true;
          // FIXME: should show away status better:
          this.element.hide();
        },
    
        // place Cursor rotate function down here FIXME: this doesnt do anything anymore.  This is in the CSS as an animation
        rotateCursorDown: function(){
          var e = $(this.element).find('svg');
            e.animate({borderSpacing: -150, opacity: 1}, {
            step: function(now, fx) {
              if (fx.prop == "borderSpacing") {
                e.css('-webkit-transform', 'rotate('+now+'deg)')
                  .css('-moz-transform', 'rotate('+now+'deg)')
                  .css('-ms-transform', 'rotate('+now+'deg)')
                  .css('-o-transform', 'rotate('+now+'deg)')
                  .css('transform', 'rotate('+now+'deg)');
              } else {
                e.css(fx.prop, now);
              }
            },
            duration: 500
          }, 'linear').promise().then(function () {
            e.css('-webkit-transform', '')
              .css('-moz-transform', '')
              .css('-ms-transform', '')
              .css('-o-transform', '')
              .css('transform', '')
              .css("opacity", "");
          });
        },
    
        setPosition: function (top, left) {
          var wTop = $(window).scrollTop();
          var height = $(window).height();
    
          if (top < wTop) {
            // FIXME: this is a totally arbitrary number, but is meant to be big enough
            // to keep the cursor name from being off the top of the screen.
            top = 25;
            this.setClass("togetherjs-scrolled-above");
          } else if (top > wTop + height - CURSOR_HEIGHT) {
            top = height - CURSOR_HEIGHT - 5;
            this.setClass("togetherjs-scrolled-below");
          } else {
            this.setClass("togetherjs-scrolled-normal");
          }
          this.element.css({
            top: top,
            left: left
          });
        },
    
        refresh: function () {
          if (this.lastTop !== null) {
            this.setPosition(this.lastTop, this.lastLeft);
          }
        },
    
        setKeydown: function () {
          if (this.keydownTimeout) {
            clearTimeout(this.keydownTimeout);
          } else {
            this.element.find(".togetherjs-cursor-typing").show().animateKeyboard();
          }
          this.keydownTimeout = setTimeout(this.clearKeydown, this.KEYDOWN_WAIT_TIME);
        },
    
        clearKeydown: function () {
          this.keydownTimeout = null;
          this.element.find(".togetherjs-cursor-typing").hide().stopKeyboardAnimation();
        },
    
        _destroy: function () {
          this.element.remove();
          this.element = null;
        }
      });
    
      Cursor._cursors = {};
    
      cursor.getClient = Cursor.getClient = function (clientId) {
        var c = Cursor._cursors[clientId];
        if (! c) {
          c = Cursor._cursors[clientId] = Cursor(clientId);
        }
        return c;
      };
    
      Cursor.forEach = function (callback, context) {
        context = context || null;
        for (var a in Cursor._cursors) {
          if (Cursor._cursors.hasOwnProperty(a)) {
            callback.call(context, Cursor._cursors[a], a);
          }
        }
      };
    
      Cursor.destroy = function (clientId) {
        Cursor._cursors[clientId]._destroy();
        delete Cursor._cursors[clientId];
      };
    
      peers.on("new-peer identity-updated status-updated", function (peer) {
        var c = Cursor.getClient(peer.id);
        c.updatePeer(peer);
      });
    
      var lastTime = 0;
      var MIN_TIME = 100;
      var lastPosX = -1;
      var lastPosY = -1;
      var lastMessage = null;
      function mousemove(event) {
        var now = Date.now();
        if (now - lastTime < MIN_TIME) {
          return;
        }
        lastTime = now;
        var pageX = event.pageX;
        var pageY = event.pageY;
        if (Math.abs(lastPosX - pageX) < 3 && Math.abs(lastPosY - pageY) < 3) {
          // Not a substantial enough change
          return;
        }
        lastPosX = pageX;
        lastPosY = pageY;
        var target = event.target;
        var parent = $(target).closest(".togetherjs-window, .togetherjs-popup, #togetherjs-dock");
        if (parent.length) {
          target = parent[0];
        } else if (elementFinder.ignoreElement(target)) {
          target = null;
        }
        if ((! target) || target == document.documentElement || target == document.body) {
          lastMessage = {
            type: "cursor-update",
            top: pageY,
            left: pageX
          };
          session.send(lastMessage);
          return;
        }
        target = $(target);
        var offset = target.offset();
        if (! offset) {
          // FIXME: this really is walkabout.js's problem to fire events on the
          // document instead of a specific element
          console.warn("Could not get offset of element:", target[0]);
          return;
        }
        var offsetX = pageX - offset.left;
        var offsetY = pageY - offset.top;
        lastMessage = {
          type: "cursor-update",
          top: pageY,
          left: pageX,
          element: elementFinder.elementLocation(target),
          offsetX: Math.floor(offsetX),
          offsetY: Math.floor(offsetY)
        };
        session.send(lastMessage);
      }
    
      function makeCursor(color) {
        var canvas = $("<canvas></canvas>");
        canvas.attr("height", CURSOR_HEIGHT);
        canvas.attr("width", CURSOR_WIDTH);
        var context = canvas[0].getContext('2d');
        context.fillStyle = color;
        context.moveTo(0, 0);
        context.beginPath();
        context.lineTo(0, CURSOR_HEIGHT/1.2);
        context.lineTo(Math.sin(CURSOR_ANGLE/2) * CURSOR_HEIGHT / 1.5,
                       Math.cos(CURSOR_ANGLE/2) * CURSOR_HEIGHT / 1.5);
        context.lineTo(Math.sin(CURSOR_ANGLE) * CURSOR_HEIGHT / 1.2,
                       Math.cos(CURSOR_ANGLE) * CURSOR_HEIGHT / 1.2);
        context.lineTo(0, 0);
        context.shadowColor = 'rgba(0,0,0,0.3)';
        context.shadowBlur = 2;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 2;
        context.strokeStyle = "#ffffff";
        context.stroke();
        context.fill();
        return canvas[0].toDataURL("image/png");
      }
    
      var scrollTimeout = null;
      var scrollTimeoutSet = 0;
      var SCROLL_DELAY_TIMEOUT = 75;
      var SCROLL_DELAY_LIMIT = 300;
    
      function scroll() {
        var now = Date.now();
        if (scrollTimeout) {
          if (now - scrollTimeoutSet < SCROLL_DELAY_LIMIT) {
            clearTimeout(scrollTimeout);
          } else {
            // Just let it progress anyway
            return;
          }
        }
        scrollTimeout = setTimeout(_scrollRefresh, SCROLL_DELAY_TIMEOUT);
        if (! scrollTimeoutSet) {
          scrollTimeoutSet = now;
        }
      }
    
      var lastScrollMessage = null;
      function _scrollRefresh() {
        scrollTimeout = null;
        scrollTimeoutSet = 0;
        Cursor.forEach(function (c) {
          c.refresh();
        });
        lastScrollMessage = {
          type: "scroll-update",
          position: elementFinder.elementByPixel($(window).scrollTop())
        };
        session.send(lastScrollMessage);
      }
    
      // FIXME: do the same thing for cursor position?  And give up on the
      // ad hoc update-on-hello?
      session.on("prepare-hello", function (helloMessage) {
        if (lastScrollMessage) {
          helloMessage.scrollPosition = lastScrollMessage.position;
        }
      });
    
      session.hub.on("scroll-update", function (msg) {
        msg.peer.scrollPosition = msg.position;
        if (msg.peer.following) {
          msg.peer.view.scrollTo();
        }
      });
    
      // In case there are multiple peers, we track that we've accepted one of their
      // hello-based scroll updates, just so we don't bounce around (we don't intelligently
      // choose which one to use, just the first that comes in)
      var acceptedScrollUpdate = false;
      session.hub.on("hello-back hello", function (msg) {
        if (msg.type == "hello") {
          // Once a hello comes in, a bunch of hello-backs not intended for us will also
          // come in, and we should ignore them
          acceptedScrollUpdate = true;
        }
        if (! msg.scrollPosition) {
          return;
        }
        msg.peer.scrollPosition = msg.scrollPosition;
        if ((! acceptedScrollUpdate) &&
            msg.sameUrl &&
            Date.now() - session.timeHelloSent < SCROLL_UPDATE_CUTOFF) {
          acceptedScrollUpdate = true;
          msg.peer.view.scrollTo();
        }
      });
    
      session.on("ui-ready", function () {
        $(document).mousemove(mousemove);
        document.addEventListener("click", documentClick, true);
        document.addEventListener("keydown", documentKeydown, true);
        $(window).scroll(scroll);
        scroll();
      });
    
      session.on("close", function () {
        Cursor.forEach(function (c, clientId) {
          Cursor.destroy(clientId);
        });
        $(document).unbind("mousemove", mousemove);
        document.removeEventListener("click", documentClick, true);
        document.removeEventListener("keydown", documentKeydown, true);
        $(window).unbind("scroll", scroll);
      });
    
      session.hub.on("hello", function (msg) {
        // Immediately get our cursor onto this new person's screen:
        if (lastMessage) {
          session.send(lastMessage);
        }
        if (lastScrollMessage) {
          session.send(lastScrollMessage);
        }
      });
    
      function documentClick(event) {
        if (event.togetherjsInternal) {
          // This is an artificial internal event
          return;
        }
        // FIXME: this might just be my imagination, but somehow I just
        // really don't want to do anything at this stage of the event
        // handling (since I'm catching every click), and I'll just do
        // something real soon:
        setTimeout(function () {
          if (! TogetherJS.running) {
            // This can end up running right after TogetherJS has been closed, often
            // because TogetherJS was closed with a click...
            return;
          }
          var element = event.target;
          if (element == document.documentElement) {
            // For some reason clicking on <body> gives the <html> element here
            element = document.body;
          }
          if (elementFinder.ignoreElement(element)) {
            return;
          }
          //Prevent click events on video objects to avoid conflicts with
          //togetherjs's own video events
          if (element.nodeName.toLowerCase() === 'video'){
            return;
          }
    
          var dontShowClicks = TogetherJS.config.get("dontShowClicks");
          var cloneClicks = TogetherJS.config.get("cloneClicks");
          // If you dont want to clone the click for this element
          // and you dont want to show the click for this element or you dont want to show any clicks
          // then return to avoid sending a useless click
          if ((! util.matchElement(element, cloneClicks)) && util.matchElement(element, dontShowClicks)) {
            return;
          }
          var location = elementFinder.elementLocation(element);
          var offset = $(element).offset();
          var offsetX = event.pageX - offset.left;
          var offsetY = event.pageY - offset.top;
          session.send({
            type: "cursor-click",
            element: location,
            offsetX: offsetX,
            offsetY: offsetY
          });
          if (util.matchElement(element, dontShowClicks)) {
            return;
          }
          displayClick({top: event.pageY, left: event.pageX}, peers.Self.color);
        });
      }
    
      var CLICK_TRANSITION_TIME = 3000;
    
      session.hub.on("cursor-click", function (pos) {
        // When the click is calculated isn't always the same as how the
        // last cursor update was calculated, so we force the cursor to
        // the last location during a click:
        if (! pos.sameUrl) {
          // FIXME: if we *could have* done a local click, but we follow along
          // later, we'll be in different states if that click was important.
          // Mostly click cloning just won't work.
          return;
        }
        Cursor.getClient(pos.clientId).updatePosition(pos);
        var target = $(elementFinder.findElement(pos.element));
        var offset = target.offset();
        var top = offset.top + pos.offsetY;
        var left = offset.left + pos.offsetX;
        var cloneClicks = TogetherJS.config.get("cloneClicks");
        if (util.matchElement(target, cloneClicks)) {
          eventMaker.performClick(target);
        }
        var dontShowClicks = TogetherJS.config.get("dontShowClicks");
        if (util.matchElement(target, dontShowClicks)) {
          return;
        }
        displayClick({top: top, left: left}, pos.peer.color);
      });
    
      function displayClick(pos, color) {
        // FIXME: should we hide the local click if no one else is going to see it?
        // That means tracking who might be able to see our screen.
        var element = templating.clone("click");
        $(document.body).append(element);
        element.css({
          top: pos.top,
          left: pos.left,
          borderColor: color
        });
        setTimeout(function () {
          element.addClass("togetherjs-clicking");
        }, 100);
        setTimeout(function () {
          element.remove();
        }, CLICK_TRANSITION_TIME);
      }
    
      var lastKeydown = 0;
      var MIN_KEYDOWN_TIME = 500;
    
      function documentKeydown(event) {
        setTimeout(function () {
          var now = Date.now();
          if (now - lastKeydown < MIN_KEYDOWN_TIME) {
            return;
          }
          lastKeydown = now;
          // FIXME: is event.target interesting here?  That is, *what* the
          // user is typing into, not just that the user is typing?  Also
          // I'm assuming we don't care if the user it typing into a
          // togetherjs-related field, since chat activity is as interesting
          // as any other activity.
          session.send({type: "keydown"});
        });
      }
    
      session.hub.on("keydown", function (msg) {
        // FIXME: when the cursor is hidden there's nothing to show with setKeydown().
        var cursor = Cursor.getClient(msg.clientId);
        cursor.setKeydown();
      });
    
      util.testExpose({Cursor: Cursor});
    
      return cursor;
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('ot',["util"], function (util) {
    
      var ot = util.Module("ot");
      var assert = util.assert;
    
      var StringSet = util.Class({
        /* Set that only supports string items */
        constructor: function () {
          this._items = {};
          this._count = 0;
        },
        contains: function (k) {
          assert(typeof k == "string");
          return this._items.hasOwnProperty(k);
        },
        add: function (k) {
          assert(typeof k == "string");
          if (this.contains(k)) {
            return;
          }
          this._items[k] = null;
          this._count++;
        },
        remove: function (k) {
          assert(typeof k == "string");
          if (! this.contains(k)) {
            return;
          }
          delete this._items[k];
          this._count++;
        },
        isEmpty: function () {
          return ! this._count;
        }
      });
    
      var Queue = util.Class({
    
        constructor: function (size) {
          this._q = [];
          this._size = size;
          this._deleted = 0;
        },
    
        _trim: function () {
          if (this._size) {
            if (this._q.length > this._size) {
              this._q.splice(0, this._q.length - this._size);
              this._deleted += this._q.length - this._size;
            }
          }
        },
    
        push: function (item) {
          this._q.push(item);
          this._trim();
        },
    
        last: function () {
          return this._q[this._q.length-1];
        },
    
        walkBack: function (callback, context) {
          var result = true;
          for (var i=this._q.length-1; i >= 0; i--) {
            var item = this._q[i];
            result = callback.call(context, item, i + this._deleted);
            if (result === false) {
              return result;
            } else if (! result) {
              result = true;
            }
          }
          return result;
        },
    
        walkForward: function (index, callback, context) {
          var result = true;
          for (var i=index; i<this._q.length; i++) {
            var item = this._q[i-this._deleted];
            result = callback.call(context, item, i);
            if (result === false) {
              return result;
            } else if (! result) {
              result = true;
            }
          }
          return result;
        },
    
        insert: function (index, item) {
          this._q.splice(index-this._deleted, 0, item);
        }
    
      });
    
      var Change = util.Class({
    
        constructor: function (version, clientId, delta, known, outOfOrder) {
          this.version = version;
          this.clientId = clientId;
          this.delta = delta;
          this.known = known;
          this.outOfOrder = !! outOfOrder;
          assert(typeof version == "number" && typeof clientId == "string",
                 "Bad Change():", version, clientId);
        },
    
        toString: function () {
          var s = "[Change " + this.version + "." + this.clientId + ": ";
          s += this.delta + " ";
          if (this.outOfOrder) {
            s += "(out of order) ";
          }
          var cids = [];
          for (var a in this.known) {
            if (this.known.hasOwnProperty(a)) {
              cids.push(a);
            }
          }
          cids.sort();
          s += "{";
          if (! cids.length) {
            s += "nothing known";
          } else {
            cids.forEach(function (a, index) {
              if (index) {
                s += ";";
              }
              s += a + ":" + this.known[a];
            }, this);
          }
          return s + "}]";
        },
    
        clone: function () {
          return Change(this.version, this.clientId, this.delta.clone(), util.extend(this.known), this.outOfOrder);
        },
    
        isBefore: function (otherChange) {
          assert(otherChange !== this, "Tried to compare a change to itself", this);
          return otherChange.version > this.version ||
              (otherChange.version == this.version && otherChange.clientId > this.clientId);
        },
    
        knowsAboutAll: function (versions) {
          for (var clientId in versions) {
            if (! versions.hasOwnProperty(clientId)) {
              continue;
            }
            if (! versions[clientId]) {
              continue;
            }
            if ((! this.known[clientId]) || this.known[clientId] < versions[clientId]) {
              return false;
            }
          }
          return true;
        },
    
        knowsAboutChange: function (change) {
          return change.clientId == this.clientId ||
              (this.known[change.clientId] && this.known[change.clientId] >= change.version);
        },
    
        knowsAboutVersion: function (version, clientId) {
          if ((! version) || clientId == this.clientId) {
            return true;
          }
          return this.known[clientId] && this.known[clientId] >= version;
        },
    
        maybeMissingChanges: function (mostRecentVersion, clientId) {
          if (! mostRecentVersion) {
            // No actual changes for clientId exist
            return false;
          }
          if (! this.known[clientId]) {
            // We don't even know about clientId, so we are definitely missing something
            return true;
          }
          if (this.known[clientId] >= mostRecentVersion) {
            // We know about all versions through mostRecentVersion
            return false;
          }
          if ((clientId > this.clientId && this.known[clientId] >= this.version-1) ||
              (clientId < this.clientId && this.known[clientId] == this.version)) {
            // We know about all versions from clientId that could exist before this
            // version
            return false;
          }
          // We may or may not be missing something
          return true;
        }
      });
    
      /* SimpleHistory synchronizes peers by relying on the server to serialize
       * the order of all updates.  Each client maintains a queue of patches
       * which have not yet been 'committed' (by being echoed back from the
       * server).  The client is responsible for transposing its own queue
       * if 'earlier' patches are heard from the server.
       *
       * Let's say that A's edit "1" and B's edit "2" occur and get put in
       * their respective SimpleHistory queues.  The server happens to
       * handle 1 first, then 2, so those are the order that all peers
       * (both A and B) see the messages.
       *
       * A sees 1, and has 1 on its queue, so everything's fine. It
       * updates the 'committed' text to match its current text and drops
       * the patch from its queue. It then sees 2, but the basis number
       * for 2 no longer matches the committed basis, so it throws it
       * away.
       *
       * B sees 1, and has 2 on its queue. It does the OT transpose thing,
       * updating the committed text to include 1 and the 'current' text
       * to include 1+2. It updates its queue with the newly transposed
       * version of 2 (call it 2prime) and updates 2prime's basis
       * number. It them resends 2prime to the server. It then receives 2
       * (the original) but the basis number no longer matches the
       * committed basis, so it throws it away.
       *
       * Now the server sees 2prime and rebroadcasts it to both A and B.
       *
       * A is seeing it for the first time, and the basis number matches,
       * so it applies it to the current and committed text.
       *
       * B sees that 2prime matches what's on the start of its queue,
       * shifts it off, and updates the committed text to match the
       * current text.
       *
       * Note that no one tries to keep an entire history of changes,
       * which is the main difference with ot.History.  Everyone applies
       * the same patches in the same order.
       */
      ot.SimpleHistory = util.Class({
    
        constructor: function(clientId, initState, initBasis) {
          this.clientId = clientId;
          this.committed = initState;
          this.current = initState;
          this.basis = initBasis;
          this.queue = [];
          this.deltaId = 1;
          this.selection = null;
        },
    
        // Use a fake change to represent the selection.
        // (This is the only bit that hard codes ot.TextReplace as the delta
        // representation; override this in a subclass (or don't set the
        // selection) if you are using a different delta representation.
        setSelection: function(selection) {
          if (selection) {
            this.selection = ot.TextReplace(selection[0],
                                            selection[1] - selection[0], '@');
          } else {
            this.selection = null;
          }
        },
    
        // Decode the fake change to reconstruct the updated selection.
        getSelection: function() {
          if (! this.selection) {
            return null;
          }
          return [this.selection.start, this.selection.start + this.selection.del];
        },
    
        // Add this delta to this client's queue.
        add: function(delta) {
          var change = {
            id: this.clientId + '.' + (this.deltaId++),
            delta: delta
          };
          if (! this.queue.length) {
            change.basis = this.basis;
          }
          this.queue.push(change);
          this.current = delta.apply(this.current);
          return !!change.basis;
        },
    
        // Apply a delta received from the server.
        // Return true iff the current text changed as a result.
        commit: function(change) {
    
          // ignore it if the basis doesn't match (this patch doesn't apply)
          // if so, this delta is out of order; we expect the original client
          // to retransmit an updated delta.
          if (change.basis !== this.basis) {
            return false; // 'current' text did not change
          }
    
          // is this the first thing on the queue?
          if (this.queue.length && this.queue[0].id === change.id) {
            assert(change.basis === this.queue[0].basis);
            // good, apply this to commit state & remove it from queue
            this.committed = this.queue.shift().delta.apply(this.committed);
            this.basis++;
            if (this.queue.length) {
              this.queue[0].basis = this.basis;
            }
            return false; // 'current' text did not change
          }
    
          // Transpose all bits on the queue to put this patch first.
          var inserted = change.delta;
          this.queue = this.queue.map(function(qchange) {
            var tt = qchange.delta.transpose(inserted);
            inserted = tt[1];
            return {
              id: qchange.id,
              delta: tt[0]
            };
          });
          if (this.selection) {
            // update the selection!
            this.selection = this.selection.transpose(inserted)[0];
          }
          this.committed = change.delta.apply(this.committed);
          this.basis++;
          if (this.queue.length) {
            this.queue[0].basis = this.basis;
          }
          // Update current by replaying queued changes starting from 'committed'
          this.current = this.committed;
          this.queue.forEach(function(qchange) {
            this.current = qchange.delta.apply(this.current);
          }.bind(this));
          return true; // The 'current' text changed.
        },
    
        // Return the next change to transmit to the server, or null if there
        // isn't one.
        getNextToSend: function() {
          var qchange = this.queue[0];
          if (! qchange) {
            /* nothing to send */
            return null;
          }
          if (qchange.sent) {
            /* already sent */
            return null;
          }
          assert(qchange.basis);
          qchange.sent = true;
          return qchange;
        }
      });
    
      ot.History = util.Class({
    
        constructor: function (clientId, initState) {
          this._history = Queue();
          this._history.push({
            clientId: "init", state: initState
          });
          this.clientId = clientId;
          this.known = {};
          this.mostRecentLocalChange = null;
        },
    
        add: function (change) {
          // Simplest cast, it is our change:
          if (change.clientId == this.clientId) {
            this._history.push(change);
            this.mostRecentLocalChange = change.version;
            return change.delta;
          }
          assert((! this.known[change.clientId]) || this.known[change.clientId] < change.version,
                "Got a change", change, "that appears older (or same as) a known change", this.known[change.clientId]);
          // Second simplest case, we get a change that we can add to our
          // history without modification:
          var last = this._history.last();
          if ((last.clientId == "init" || last.isBefore(change)) &&
              change.knowsAboutAll(this.known) &&
              change.knowsAboutVersion(this.mostRecentLocalChange, this.clientId)) {
            this._history.push(change);
            this.known[change.clientId] = change.version;
            return change.delta;
          }
          // We must do work!
    
          this.logHistory("//");
    
          // First we check if we need to modify this change because we
          // know about changes that it should know about (changes that
          // preceed it that are in our local history).
          var clientsToCheck = StringSet();
          for (var clientId in this.known) {
            if (! this.known.hasOwnProperty(clientId)) {
              continue;
            }
            if (change.maybeMissingChanges(this.known[clientId], clientId)) {
              clientsToCheck.add(clientId);
            }
          }
          if (change.maybeMissingChanges(this.mostRecentLocalChange, this.clientId)) {
            clientsToCheck.add(this.clientId);
          }
          if (! clientsToCheck.isEmpty()) {
            var indexToCheckFrom = null;
            this._history.walkBack(function (c, index) {
              indexToCheckFrom = index;
              if (c.clientId == "init") {
                return false;
              }
              if (clientsToCheck.contains(c.clientId) &&
                  ! change.maybeMissingChanges(c.version, c.clientId)) {
                clientsToCheck.remove(c.clientId);
                if (clientsToCheck.isEmpty()) {
                  return false;
                }
              }
              return true;
            }, this);
            this._history.walkForward(indexToCheckFrom, function (c, index) {
              if (c.clientId == "init") {
                return true;
              }
              if (change.isBefore(c)) {
                return false;
              }
              if (! change.knowsAboutChange(c)) {
                var presentDelta = this.promoteDelta(c.delta, index, change);
                if (! presentDelta.equals(c.delta)) {
                  //console.log("->rebase delta rewrite", presentDelta+"");
                }
                this.logChange("->rebase", change, function () {
                  var result = change.delta.transpose(presentDelta);
                  change.delta = result[0];
                  change.known[c.clientId] = c.version;
                }, "with:", c);
              }
              return true;
            }, this);
          }
    
          // Next we insert the change into its proper location
          var indexToInsert = null;
          this._history.walkBack(function (c, index) {
            if (c.clientId == "init" || c.isBefore(change)) {
              indexToInsert = index+1;
              return false;
            }
            return true;
          }, this);
          assert(indexToInsert);
          this._history.insert(indexToInsert, change);
    
          // Now we fix up any forward changes
          var fixupDelta = change.delta;
          this._history.walkForward(indexToInsert+1, function (c, index) {
            if (! c.knowsAboutChange(change)) {
              var origChange = c.clone();
              this.logChange("^^fix", c, function () {
                var fixupResult = c.delta.transpose(fixupDelta);
                //console.log("  ^^real");
                var result = c.delta.transpose(fixupDelta);
                c.delta = result[0];
                c.known[change.clientId] = change.version;
                fixupDelta = fixupResult[1];
              }, "clone:", change.delta+"");
              //console.log("(trans)", fixupDelta+"");
              assert(c.knowsAboutChange(change));
            }
          }, this);
    
          // Finally we return the transformed delta that represents
          // changes that should be made to the state:
    
          this.logHistory("!!");
          return fixupDelta;
        },
    
        promoteDelta: function (delta, deltaIndex, untilChange) {
          this._history.walkForward(deltaIndex+1, function (c, index) {
            if (untilChange.isBefore(c)) {
              return false;
            }
            // FIXME: not sure if this clientId check here is right.  Maybe
            // if untilChange.knowsAbout(c)?
            if (untilChange.knowsAboutChange(c)) {
              var result = c.delta.transpose(delta);
              delta = result[1];
            }
            return true;
          });
          return delta;
        },
    
        logHistory: function (prefix) {
          prefix = prefix || "";
          var postfix = Array.prototype.slice.call(arguments, 1);
          console.log.apply(console, [prefix + "history", this.clientId, ":"].concat(postfix));
          console.log(prefix + " state:", JSON.stringify(this.getStateSafe()));
          var hstate;
          this._history.walkForward(0, function (c, index) {
            if (! index) {
              assert(c.clientId == "init");
              console.log(prefix + " init:", JSON.stringify(c.state));
              hstate = c.state;
            } else {
              try {
                hstate = c.delta.apply(hstate);
              } catch (e) {
                hstate = "Error: " + e;
              }
              console.log(prefix + "  ", index, c+"", JSON.stringify(hstate));
            }
          });
        },
    
        logChange: function (prefix, change, callback) {
          prefix = prefix || "before";
          var postfix = Array.prototype.slice.call(arguments, 3);
          console.log.apply(
            console,
            [prefix, this.clientId, ":", change+""].concat(postfix).concat([JSON.stringify(this.getStateSafe(true))]));
          try {
            callback();
          } finally {
            console.log(prefix + " after:", change+"", JSON.stringify(this.getStateSafe()));
          }
        },
    
        addDelta: function (delta) {
          var version = this._createVersion();
          var change = Change(version, this.clientId, delta, util.extend(this.knownVersions));
          this.add(change);
          return change;
        },
    
        _createVersion: function () {
          var max = 1;
          for (var id in this.knownVersions) {
            max = Math.max(max, this.knownVersions[id]);
          }
          max = Math.max(max, this.mostRecentLocalChange);
          return max+1;
        },
    
        fault: function (change) {
          throw new Error('Fault');
        },
    
        getState: function () {
          var state;
          this._history.walkForward(0, function (c) {
            if (c.clientId == "init") {
              // Initialization, has the state
              state = c.state;
            } else {
              state = c.delta.apply(state);
            }
          }, this);
          return state;
        },
    
        getStateSafe: function () {
          try {
            return this.getState();
          } catch (e) {
            return 'Error: ' + e;
          }
        }
    
      });
    
      ot.TextReplace = util.Class({
    
        constructor: function (start, del, text) {
          assert(typeof start == "number" && typeof del == "number" && typeof text == "string", start, del, text);
          assert(start >=0 && del >= 0, start, del);
          this.start = start;
          this.del = del;
          this.text = text;
        },
    
        toString: function () {
          if (this.empty()) {
            return '[no-op]';
          }
          if (! this.del) {
            return '[insert ' + JSON.stringify(this.text) + ' @' + this.start + ']';
          } else if (! this.text) {
            return '[delete ' + this.del + ' chars @' + this.start + ']';
          } else {
            return '[replace ' + this.del + ' chars with ' + JSON.stringify(this.text) + ' @' + this.start + ']';
          }
        },
    
        equals: function (other) {
          return other.constructor === this.constructor &&
              other.del === this.del &&
              other.start === this.start &&
              other.text === this.text;
        },
    
        clone: function (start, del, text) {
          if (start === undefined) {
            start = this.start;
          }
          if (del === undefined) {
            del = this.del;
          }
          if (text === undefined) {
            text = this.text;
          }
          return ot.TextReplace(start, del, text);
        },
    
        empty: function () {
          return (! this.del) && (! this.text);
        },
    
        apply: function (text) {
          if (this.empty()) {
            return text;
          }
          if (this.start > text.length) {
            console.trace();
            throw new util.AssertionError("Start after end of text (" + JSON.stringify(text) + "/" + text.length + "): " + this);
          }
          if (this.start + this.del > text.length) {
            throw new util.AssertionError("Start+del after end of text (" + JSON.stringify(text) + "/" + text.length + "): " + this);
          }
          return text.substr(0, this.start) + this.text + text.substr(this.start+this.del);
        },
    
        transpose: function (delta) {
          /* Transform this delta as though the other delta had come before it.
             Returns a [new_version_of_this, transformed_delta], where transformed_delta
             satisfies:
    
             result1 = new_version_of_this.apply(delta.apply(text));
             result2 = transformed_delta.apply(this.apply(text));
             assert(result1 == result2);
    
             Does not modify this object.
          */
          var overlap;
          assert(delta instanceof ot.TextReplace, "Transposing with non-TextReplace:", delta);
          if (this.empty()) {
            //console.log("  =this is empty");
            return [this.clone(), delta.clone()];
          }
          if (delta.empty()) {
            //console.log("  =other is empty");
            return [this.clone(), delta.clone()];
          }
          if (delta.before(this)) {
            //console.log("  =this after other");
            return [this.clone(this.start + delta.text.length - delta.del),
                    delta.clone()];
          } else if (this.before(delta)) {
            //console.log("  =this before other");
            return [this.clone(), delta.clone(delta.start + this.text.length - this.del)];
          } else if (delta.sameRange(this)) {
            //console.log("  =same range");
            return [this.clone(this.start+delta.text.length, 0),
                    delta.clone(undefined, 0)];
          } else if (delta.contains(this)) {
            //console.log("  =other contains this");
            return [this.clone(delta.start+delta.text.length, 0, this.text),
                    delta.clone(undefined, delta.del - this.del + this.text.length, delta.text + this.text)];
          } else if (this.contains(delta)) {
            //console.log("  =this contains other");
            return [this.clone(undefined, this.del - delta.del + delta.text.length, delta.text + this.text),
                    delta.clone(this.start, 0, delta.text)];
          } else if (this.overlapsStart(delta)) {
            //console.log("  =this overlaps start of other");
            overlap = this.start + this.del - delta.start;
            return [this.clone(undefined, this.del - overlap),
                    delta.clone(this.start + this.text.length, delta.del - overlap)];
          } else {
            //console.log("  =this overlaps end of other");
            assert(delta.overlapsStart(this), delta+"", "does not overlap start of", this+"", delta.before(this));
            overlap = delta.start + delta.del - this.start;
            return [this.clone(delta.start + delta.text.length, this.del - overlap),
                    delta.clone(undefined, delta.del - overlap)];
          }
          throw 'Should not happen';
        },
    
        before: function (other) {
          return this.start + this.del <= other.start;
        },
    
        contains: function (other) {
          return other.start >= this.start && other.start + other.del < this.start + this.del;
        },
    
        sameRange: function (other) {
          return other.start == this.start && other.del == this.del;
        },
    
        overlapsStart: function (other) {
          return this.start < other.start && this.start + this.del > other.start;
        },
    
        classMethods: {
    
          /* Make a new ot.TextReplace that converts oldValue to newValue. */
          fromChange: function(oldValue, newValue) {
            assert(typeof oldValue == "string");
            assert(typeof newValue == "string");
            var commonStart = 0;
            while (commonStart < newValue.length &&
                   newValue.charAt(commonStart) == oldValue.charAt(commonStart)) {
              commonStart++;
            }
            var commonEnd = 0;
            while (commonEnd < (newValue.length - commonStart) &&
                   commonEnd < (oldValue.length - commonStart) &&
                   newValue.charAt(newValue.length - commonEnd - 1) ==
                   oldValue.charAt(oldValue.length - commonEnd - 1)) {
              commonEnd++;
            }
            var removed = oldValue.substr(commonStart, oldValue.length - commonStart - commonEnd);
            var inserted = newValue.substr(commonStart, newValue.length - commonStart - commonEnd);
            if (! (removed.length || inserted)) {
              return null;
            }
            return this(commonStart, removed.length, inserted);
          },
    
          random: function (source, generator) {
            var text, start, len;
            var ops = ["ins", "del", "repl"];
            if (! source.length) {
              ops = ["ins"];
            }
            switch (generator.pick(ops)) {
            case "ins":
              if (! generator.number(2)) {
                text = generator.string(1);
              } else {
                text = generator.string(generator.number(3)+1);
              }
              if (! generator.number(4)) {
                start = 0;
              } else if (! generator.number(3)) {
                start = source.length-1;
              } else {
                start = generator.number(source.length);
              }
              return this(start, 0, text);
    
            case "del":
              if (! generator.number(20)) {
                return this(0, source.length, "");
              }
              start = generator.number(source.length-1);
              if (! generator.number(2)) {
                len = 1;
              } else {
                len = generator.number(5)+1;
              }
              len = Math.min(len, source.length - start);
              return this(start, len, "");
    
            case "repl":
              start = generator.number(source.length-1);
              len = generator.number(5);
              len = Math.min(len, source.length - start);
              text = generator.string(generator.number(2)+1);
              return this(start, len, text);
            }
            throw 'Unreachable';
          }
        }
      });
    
      return ot;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('forms',["jquery", "util", "session", "elementFinder", "eventMaker", "templating", "ot"], function ($, util, session, elementFinder, eventMaker, templating, ot) {
      var forms = util.Module("forms");
      var assert = util.assert;
    
      // This is how much larger the focus element is than the element it surrounds
      // (this is padding on each side)
      var FOCUS_BUFFER = 5;
    
      var inRemoteUpdate = false;
    
      function suppressSync(element) {
        var ignoreForms = TogetherJS.config.get("ignoreForms");
        if (ignoreForms === true) {
          return true;
        }
        else {
          return $(element).is(ignoreForms.join(",")); 
        }
      }
    
      function maybeChange(event) {
        // Called when we get an event that may or may not indicate a real change
        // (like keyup in a textarea)
        var tag = event.target.tagName;
        if (tag == "TEXTAREA" || tag == "INPUT") {
          change(event);
        }
      }
    
      function change(event) {
        sendData({
          element: event.target,
          value: getValue(event.target)
        });
      }
    
      function sendData(attrs) {
        var el = $(attrs.element);
        assert(el);
        var tracker = attrs.tracker;
        var value = attrs.value;
        if (inRemoteUpdate) {
          return;
        }
        if (elementFinder.ignoreElement(el) ||
            (elementTracked(el) && !tracker) ||
            suppressSync(el)) {
          return;
        }
        var location = elementFinder.elementLocation(el);
        var msg = {
          type: "form-update",
          element: location
        };
        if (isText(el) || tracker) {
          var history = el.data("togetherjsHistory");
          if (history) {
            if (history.current == value) {
              return;
            }
            var delta = ot.TextReplace.fromChange(history.current, value);
            assert(delta);
            history.add(delta);
            maybeSendUpdate(msg.element, history, tracker);
            return;
          } else {
            msg.value = value;
            msg.basis = 1;
            el.data("togetherjsHistory", ot.SimpleHistory(session.clientId, value, 1));
          }
        } else {
          msg.value = value;
        }
        session.send(msg);
      }
    
      function isCheckable(el) {
        el = $(el);
        var type = (el.prop("type") || "text").toLowerCase();
        if (el.prop("tagName") == "INPUT" && ["radio", "checkbox"].indexOf(type) != -1) {
          return true;
        }
        return false;
      }
    
      var editTrackers = {};
      var liveTrackers = [];
    
      TogetherJS.addTracker = function (TrackerClass, skipSetInit) {
        assert(typeof TrackerClass === "function", "You must pass in a class");
        assert(typeof TrackerClass.prototype.trackerName === "string",
               "Needs a .prototype.trackerName string");
        // Test for required instance methods.
        "destroy update init makeInit tracked".split(/ /).forEach(function(m) {
          assert(typeof TrackerClass.prototype[m] === "function",
                 "Missing required tracker method: "+m);
        });
        // Test for required class methods.
        "scan tracked".split(/ /).forEach(function(m) {
          assert(typeof TrackerClass[m] === "function",
                 "Missing required tracker class method: "+m);
        });
        editTrackers[TrackerClass.prototype.trackerName] = TrackerClass;
        if (!skipSetInit) {
          setInit();
        }
      };
    
      var AceEditor = util.Class({
    
        trackerName: "AceEditor",
    
        constructor: function (el) {
          this.element = $(el)[0];
          assert($(this.element).hasClass("ace_editor"));
          this._change = this._change.bind(this);
          this._editor().document.on("change", this._change);
        },
    
        tracked: function (el) {
          return this.element === $(el)[0];
        },
    
        destroy: function (el) {
          this._editor().document.removeListener("change", this._change);
        },
    
        update: function (msg) {
          this._editor().document.setValue(msg.value);
        },
    
        init: function (update, msg) {
          this.update(update);
        },
    
        makeInit: function () {
          return {
            element: this.element,
            tracker: this.trackerName,
            value: this._editor().document.getValue()
          };
        },
    
        _editor: function () {
          return this.element.env;
        },
    
        _change: function (e) {
          // FIXME: I should have an internal .send() function that automatically
          // asserts !inRemoteUpdate, among other things
          if (inRemoteUpdate) {
            return;
          }
          sendData({
            tracker: this.trackerName,
            element: this.element,
            value: this.getContent()
          });
        },
    
        getContent: function() {
          return this._editor().document.getValue();
        }
      });
    
      AceEditor.scan = function () {
        return $(".ace_editor");
      };
    
      AceEditor.tracked = function (el) {
        return !! $(el).closest(".ace_editor").length;
      };
    
      TogetherJS.addTracker(AceEditor, true /* skip setInit */);
    
      var CodeMirrorEditor = util.Class({
        trackerName: "CodeMirrorEditor",
    
        constructor: function (el) {
          this.element = $(el)[0];
          assert(this.element.CodeMirror);
          this._change = this._change.bind(this);
          this._editor().on("change", this._change);
        },
    
        tracked: function (el) {
          return this.element === $(el)[0];
        },
    
        destroy: function (el) {
          this._editor().off("change", this._change);
        },
    
        update: function (msg) {
          this._editor().setValue(msg.value);
        },
    
        init: function (msg) {
          if (msg.value) {
            this.update(msg);
          }
        },
    
        makeInit: function () {
          return {
            element: this.element,
            tracker: this.trackerName,
            value: this._editor().getValue()
          };
        },
    
        _change: function (editor, change) {
          if (inRemoteUpdate) {
            return;
          }
          sendData({
            tracker: this.trackerName,
            element: this.element,
            value: this.getContent()
          });
        },
    
        _editor: function () {
          return this.element.CodeMirror;
        },
    
        getContent: function() {
          return this._editor().getValue();
        }
      });
    
      CodeMirrorEditor.scan = function () {
        var result = [];
        var els = document.body.getElementsByTagName("*");
        var _len = els.length;
        for (var i=0; i<_len; i++) {
          var el = els[i];
          if (el.CodeMirror) {
            result.push(el);
          }
        }
        return $(result);
      };
    
      CodeMirrorEditor.tracked = function (el) {
        el = $(el)[0];
        while (el) {
          if (el.CodeMirror) {
            return true;
          }
          el = el.parentNode;
        }
        return false;
      };
    
      TogetherJS.addTracker(CodeMirrorEditor, true /* skip setInit */);
    
    
      var CKEditor = util.Class({
        trackerName: "CKEditor",
    
        constructor: function (el) {
          this.element = $(el)[0];
          assert(CKEDITOR);
          assert(CKEDITOR.dom.element.get(this.element));
          this._change = this._change.bind(this);
          // FIXME: change event is available since CKEditor 4.2
          this._editor().on("change", this._change);
        },
        tracked: function (el) {
          return this.element === $(el)[0];
        },
        destroy: function (el) {
          this._editor().removeListener("change", this._change);
        },
    
        update: function (msg) {
          //FIXME: use setHtml instead of setData to avoid frame reloading overhead
          this._editor().editable().setHtml(msg.value);
        },
    
        init: function (update, msg) {
          this.update(update);
        },
    
        makeInit: function () {
          return {
            element: this.element,
            tracker: this.trackerName,
            value: this.getContent()
          };
        },
    
        _change: function (e) {
          if (inRemoteUpdate) {
            return;
          }
          sendData({
            tracker: this.trackerName,
            element: this.element,
            value: this.getContent()
          });
        },
    
        _editor: function () {
          return CKEDITOR.dom.element.get(this.element).getEditor();
        },
        
        getContent: function () {
          return this._editor().getData();
        }
      });
    
      CKEditor.scan = function () {
        var result = [];
        if (typeof CKEDITOR == "undefined") {
          return;
        }
        var editorInstance;
        for (var instanceIdentifier in CKEDITOR.instances) {
          editorInstance = document.getElementById(instanceIdentifier) || document.getElementsByName(instanceIdentifier)[0];
          if (editorInstance) {
            result.push(editorInstance);
          }
        }
        return $(result);
      };
    
      CKEditor.tracked = function (el) {
        if (typeof CKEDITOR == "undefined") {
          return false;
        }
        el = $(el)[0];
        return !! (CKEDITOR.dom.element.get(el) && CKEDITOR.dom.element.get(el).getEditor());
      };
    
      TogetherJS.addTracker(CKEditor, true /* skip setInit */);
    
    
      function buildTrackers() {
        assert(! liveTrackers.length);
        util.forEachAttr(editTrackers, function (TrackerClass) {
          var els = TrackerClass.scan();
          if (els) {
            $.each(els, function () {
              var tracker = new TrackerClass(this);
              $(this).data("togetherjsHistory", ot.SimpleHistory(session.clientId, tracker.getContent(), 1));
              liveTrackers.push(tracker);
            });
          }
        });
      }
    
      function destroyTrackers() {
        liveTrackers.forEach(function (tracker) {
          tracker.destroy();
        });
        liveTrackers = [];
      }
    
      function elementTracked(el) {
        var result = false;
        util.forEachAttr(editTrackers, function (TrackerClass) {
          if (TrackerClass.tracked(el)) {
            result = true;
          }
        });
        return result;
      }
    
      function getTracker(el, name) {
        el = $(el)[0];
        for (var i=0; i<liveTrackers.length; i++) {
          var tracker = liveTrackers[i];
          if (tracker.tracked(el)) {
            assert((! name) || name == tracker.trackerName, "Expected to map to a tracker type", name, "but got", tracker.trackerName);
            return tracker;
          }
        }
        return null;
      }
    
      var TEXT_TYPES = (
        "color date datetime datetime-local email " +
            "tel text time week").split(/ /g);
    
      function isText(el) {
        el = $(el);
        var tag = el.prop("tagName");
        var type = (el.prop("type") || "text").toLowerCase();
        if (tag == "TEXTAREA") {
          return true;
        }
        if (tag == "INPUT" && TEXT_TYPES.indexOf(type) != -1) {
          return true;
        }
        return false;
      }
    
      function getValue(el) {
        el = $(el);
        if (isCheckable(el)) {
          return el.prop("checked");
        } else {
          return el.val();
        }
      }
    
      function getElementType(el) {
        el = $(el)[0];
        if (el.tagName == "TEXTAREA") {
          return "textarea";
        }
        if (el.tagName == "SELECT") {
          return "select";
        }
        if (el.tagName == "INPUT") {
          return (el.getAttribute("type") || "text").toLowerCase();
        }
        return "?";
      }
    
      function setValue(el, value) {
        el = $(el);
        var changed = false;
        if (isCheckable(el)) {
          var checked = !! el.prop("checked");
          value = !! value;
          if (checked != value) {
            changed = true;
            el.prop("checked", value);
          }
        } else {
          if (el.val() != value) {
            changed = true;
            el.val(value);
          }
        }
        if (changed) {
          eventMaker.fireChange(el);
        }
      }
    
      /* Send the top of this history queue, if it hasn't been already sent. */
      function maybeSendUpdate(element, history, tracker) {
        var change = history.getNextToSend();
        if (! change) {
          /* nothing to send */
          return;
        }
        var msg = {
          type: "form-update",
          element: element,
          "server-echo": true,
          replace: {
            id: change.id,
            basis: change.basis,
            delta: {
              start: change.delta.start,
              del: change.delta.del,
              text: change.delta.text
            }
          }
        };
        if (tracker) {
          msg.tracker = tracker;
        }
        session.send(msg);
      }
    
      session.hub.on("form-update", function (msg) {
        if (! msg.sameUrl) {
          return;
        }
        var el = $(elementFinder.findElement(msg.element));
        var tracker;
        if (msg.tracker) {
          tracker = getTracker(el, msg.tracker);
          assert(tracker);
        }
        var focusedEl = el[0].ownerDocument.activeElement;
        var focusedElSelection;
        if (isText(focusedEl)) {
          focusedElSelection = [focusedEl.selectionStart, focusedEl.selectionEnd];
        }
        var selection;
        if (isText(el)) {
          selection = [el[0].selectionStart, el[0].selectionEnd];
        }
        var value;
        if (msg.replace) {
          var history = el.data("togetherjsHistory");
          if (!history) {
            console.warn("form update received for uninitialized form element");
            return;
          }
          history.setSelection(selection);
          // make a real TextReplace object.
          msg.replace.delta = ot.TextReplace(msg.replace.delta.start,
                                             msg.replace.delta.del,
                                             msg.replace.delta.text);
          // apply this change to the history
          var changed = history.commit(msg.replace);
          var trackerName = null;
          if (typeof tracker != "undefined") {
            trackerName = tracker.trackerName;
          }
          maybeSendUpdate(msg.element, history, trackerName);
          if (! changed) {
            return;
          }
          value = history.current;
          selection = history.getSelection();
        } else {
          value = msg.value;
        }
        inRemoteUpdate = true;
        try {
          if(tracker) {
            tracker.update({value:value});
          } else {
            setValue(el, value);
          }
          if (isText(el)) {
            el[0].selectionStart = selection[0];
            el[0].selectionEnd = selection[1];
          }
          // return focus to original input:
          if (focusedEl != el[0]) {
            focusedEl.focus();
            if (isText(focusedEl)) {
              focusedEl.selectionStart = focusedElSelection[0];
              focusedEl.selectionEnd = focusedElSelection[1];
            }
          }
        } finally {
          inRemoteUpdate = false;
        }
      });
    
      var initSent = false;
    
      function sendInit() {
        initSent = true;
        var msg = {
          type: "form-init",
          pageAge: Date.now() - TogetherJS.pageLoaded,
          updates: []
        };
        var els = $("textarea, input, select");
        els.each(function () {
          if (elementFinder.ignoreElement(this) || elementTracked(this) ||
              suppressSync(this)) {
            return;
          }
          var el = $(this);
          var value = getValue(el);
          var upd = {
            element: elementFinder.elementLocation(this),
            value: value,
            elementType: getElementType(el)
          };
          if (isText(el)) {
            var history = el.data("togetherjsHistory");
            if (history) {
              upd.value = history.committed;
              upd.basis = history.basis;
            }
          }
          msg.updates.push(upd);
        });
        liveTrackers.forEach(function (tracker) {
          var init = tracker.makeInit();
          assert(tracker.tracked(init.element));
          var history = $(init.element).data("togetherjsHistory");
          if (history) {
            init.value = history.committed;
            init.basis = history.basis;
          }
          init.element = elementFinder.elementLocation($(init.element));
          msg.updates.push(init);
        });
        if (msg.updates.length) {
          session.send(msg);
        }
      }
    
      function setInit() {
        var els = $("textarea, input, select");
        els.each(function () {
          if (elementTracked(this)) {
            return;
          }
          if (elementFinder.ignoreElement(this)) {
            return;
          }
          var el = $(this);
          var value = getValue(el);
          el.data("togetherjsHistory", ot.SimpleHistory(session.clientId, value, 1));
        });
        destroyTrackers();
        buildTrackers();
      }
    
      session.on("reinitialize", setInit);
    
      session.on("ui-ready", setInit);
    
      session.on("close", destroyTrackers);
    
      session.hub.on("form-init", function (msg) {
        if (! msg.sameUrl) {
          return;
        }
        if (initSent) {
          // In a 3+-peer situation more than one client may init; in this case
          // we're probably the other peer, and not the peer that needs the init
          // A quick check to see if we should init...
          var myAge = Date.now() - TogetherJS.pageLoaded;
          if (msg.pageAge < myAge) {
            // We've been around longer than the other person...
            return;
          }
        }
        // FIXME: need to figure out when to ignore inits
        msg.updates.forEach(function (update) {
          var el;
          try {
            el = elementFinder.findElement(update.element);
          } catch (e) {
            /* skip missing element */
            console.warn(e);
            return;
          }
            inRemoteUpdate = true;
            try {
              if (update.tracker) {
                var tracker = getTracker(el, update.tracker);
                assert(tracker);
                tracker.init(update, msg);
              } else {
                setValue(el, update.value);
              }
              if (update.basis) {
                var history = $(el).data("togetherjsHistory");
                // don't overwrite history if we're already up to date
                // (we might have outstanding queued changes we don't want to lose)
                if (!(history && history.basis === update.basis &&
                      // if history.basis is 1, the form could have lingering
                      // edits from before togetherjs was launched.  that's too bad,
                      // we need to erase them to resynchronize with the peer
                      // we just asked to join.
                      history.basis !== 1)) {
                  $(el).data("togetherjsHistory", ot.SimpleHistory(session.clientId, update.value, update.basis));
                }
              }
            } finally {
              inRemoteUpdate = false;
            }
        });
      });
    
      var lastFocus = null;
    
      function focus(event) {
        var target = event.target;
        if (elementFinder.ignoreElement(target) || elementTracked(target)) {
          blur(event);
          return;
        }
        if (target != lastFocus) {
          lastFocus = target;
          session.send({type: "form-focus", element: elementFinder.elementLocation(target)});
        }
      }
    
      function blur(event) {
        var target = event.target;
        if (lastFocus) {
          lastFocus = null;
          session.send({type: "form-focus", element: null});
        }
      }
    
      var focusElements = {};
    
      session.hub.on("form-focus", function (msg) {
        var current = focusElements[msg.peer.id];
        if (current) {
          current.remove();
          current = null;
        }
        if (! msg.element) {
          // A blur
          return;
        }
        var element = elementFinder.findElement(msg.element);
        var el = createFocusElement(msg.peer, element);
        if (el) {
          focusElements[msg.peer.id] = el;
        }
      });
    
      session.hub.on("hello", function (msg) {
        if (lastFocus) {
          setTimeout(function () {
            if (lastFocus) {
              session.send({type: "form-focus", element: elementFinder.elementLocation(lastFocus)});
            }
          });
        }
      });
    
      function createFocusElement(peer, around) {
        around = $(around);
        var aroundOffset = around.offset();
        if (! aroundOffset) {
          console.warn("Could not get offset of element:", around[0]);
          return null;
        }
        var el = templating.sub("focus", {peer: peer});
        el = el.find(".togetherjs-focus");
        el.css({
          top: aroundOffset.top-FOCUS_BUFFER + "px",
          left: aroundOffset.left-FOCUS_BUFFER + "px",
          width: around.outerWidth() + (FOCUS_BUFFER*2) + "px",
          height: around.outerHeight() + (FOCUS_BUFFER*2) + "px"
        });
        $(document.body).append(el);
        return el;
      }
    
      session.on("ui-ready", function () {
        $(document).on("change", change);
        // note that textInput, keydown, and keypress aren't appropriate events
        // to watch, since they fire *before* the element's value changes.
        $(document).on("input keyup cut paste", maybeChange);
        $(document).on("focusin", focus);
        $(document).on("focusout", blur);
      });
    
      session.on("close", function () {
        $(document).off("change", change);
        $(document).off("input keyup cut paste", maybeChange);
        $(document).off("focusin", focus);
        $(document).off("focusout", blur);
      });
    
      session.hub.on("hello", function (msg) {
        if (msg.sameUrl) {
          setTimeout(sendInit);
        }
      });
    
      return forms;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    /* This module handles all the different UI that happens (sometimes in order) when
       TogetherJS is started:
    
       - Introduce the session when you've been invited
       - Show any browser compatibility indicators
       - Show the walkthrough the first time
       - Show the share link window
    
       When everything is done it fires session.emit("startup-ready")
    
    */
    define('startup',["util", "require", "jquery", "windowing", "storage"], function (util, require, $, windowing, storage) {
      var assert = util.assert;
      var startup = util.Module("startup");
      // Avoid circular import:
      var session = null;
    
      var STEPS = [
        "browserBroken",
        "browserUnsupported",
        "sessionIntro",
        "walkthrough",
        // Look in the share() below if you add anything after here:
        "share"
        ];
    
      var currentStep = null;
    
      startup.start = function () {
        if (! session) {
          require(["session"], function (sessionModule) {
            session = sessionModule;
            startup.start();
          });
          return;
        }
        var index = -1;
        if (currentStep) {
          index = STEPS.indexOf(currentStep);
        }
        index++;
        if (index >= STEPS.length) {
          session.emit("startup-ready");
          return;
        }
        currentStep = STEPS[index];
        handlers[currentStep](startup.start);
      };
    
      var handlers = {
    
        browserBroken: function (next) {
          if (window.WebSocket) {
            next();
            return;
          }
          windowing.show("#togetherjs-browser-broken", {
            onClose: function () {
              session.close();
            }
          });
          if ($.browser.msie) {
            $("#togetherjs-browser-broken-is-ie").show();
          }
        },
    
        browserUnsupported: function (next) {
          if (! $.browser.msie) {
            next();
            return;
          }
          var cancel = true;
          windowing.show("#togetherjs-browser-unsupported", {
            onClose: function () {
              if (cancel) {
                session.close();
              } else {
                next();
              }
            }
          });
          $("#togetherjs-browser-unsupported-anyway").click(function () {
            cancel = false;
          });
        },
    
        sessionIntro: function (next) {
          if ((! session.isClient) || ! session.firstRun) {
            next();
            return;
          }
          TogetherJS.config.close("suppressJoinConfirmation");
          if (TogetherJS.config.get("suppressJoinConfirmation")) {
            next();
            return;
          }
          var cancelled = false;
          windowing.show("#togetherjs-intro", {
            onClose: function () {
              if (! cancelled) {
                next();
              }
            }
          });
          $("#togetherjs-intro .togetherjs-modal-dont-join").click(function () {
            cancelled = true;
            windowing.hide();
            session.close("declined-join");
          });
        },
    
        walkthrough: function (next) {
          storage.settings.get("seenIntroDialog").then(function (seenIntroDialog) {
            if (seenIntroDialog) {
              next();
              return;
            }
            require(["walkthrough"], function (walkthrough) {
              walkthrough.start(true, function () {
                storage.settings.set("seenIntroDialog", true);
                next();
              });
            });
          });
        },
    
        share: function (next) {
          TogetherJS.config.close("suppressInvite");
          if (session.isClient || (! session.firstRun) ||
              TogetherJS.config.get("suppressInvite")) {
            next();
            return;
          }
          require(["windowing"], function (windowing) {
            windowing.show("#togetherjs-share");
            // FIXME: no way to detect when the window is closed
            // If there was a next() step then it would not work
          });
        }
    
      };
    
      return startup;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('videos',["jquery", "util", "session", "elementFinder"],
    function ($, util, session, elementFinder) {
    
      var listeners = [];
    
      var TIME_UPDATE = 'timeupdate';
      var MIRRORED_EVENTS = ['play', 'pause'];
    
      var TOO_FAR_APART = 3000;
    
      session.on("reinitialize", function () {
        unsetListeners();
        setupListeners();
      });
    
      session.on("ui-ready", setupListeners);
    
      function setupListeners() {
        var videos = $('video');
        setupMirroredEvents(videos);
        setupTimeSync(videos);
      }
    
      function setupMirroredEvents(videos) {
        var currentListener;
        MIRRORED_EVENTS.forEach(function (eventName) {
          currentListener = makeEventSender(eventName);
          videos.on(eventName, currentListener);
          listeners.push({
            name: eventName,
            listener: currentListener
          });
        });
      }
    
      function makeEventSender(eventName) {
        return function (event, options) {
          var element = event.target;
          options || (options = {});
          if (!options.silent) {
            session.send({
              type: ('video-'+eventName),
              location: elementFinder.elementLocation(element),
              position: element.currentTime
            });
          }
        };
      }
    
      function setupTimeSync(videos) {
        videos.each(function(i, video) {
          var onTimeUpdate = makeTimeUpdater();
          $(video).on(TIME_UPDATE, onTimeUpdate);
          listeners.push({
            name: TIME_UPDATE,
            listener: onTimeUpdate
          });
        });
      }
    
      function makeTimeUpdater() {
        var last = 0;
        return function (event) {
          var currentTime = event.target.currentTime;
          if(areTooFarApart(currentTime, last)){
            makeEventSender(TIME_UPDATE)(event);
          }
          last = currentTime;
        };
      }
    
      function areTooFarApart(currentTime, lastTime) {
        var secDiff = Math.abs(currentTime - lastTime);
        var milliDiff = secDiff * 1000;
        return milliDiff > TOO_FAR_APART;
      }
    
      session.on("close", unsetListeners);
    
      function unsetListeners() {
        var videos = $('video');
        listeners.forEach(function (event) {
            videos.off(event.name, event.listener);
        });
        listeners = [];
      }
    
    
      session.hub.on('video-timeupdate', function (msg) {
        var element = $findElement(msg.location);
        var oldTime = element.prop('currentTime');
        var newTime = msg.position;
    
        //to help throttle uneccesary position changes
        if(areTooFarApart(oldTime, newTime)){
          setTime(element, msg.position);
        }
      });
    
      MIRRORED_EVENTS.forEach( function (eventName) {
        session.hub.on("video-"+eventName, function (msg) {
          var element = $findElement(msg.location);
    
          setTime(element, msg.position);
    
          element.trigger(eventName, {silent: true});
        });
      });
    
      //Currently does not discriminate between visible and invisible videos
      function $findElement(location) {
        return $(elementFinder.findElement(location));
      }
    
      function setTime(video, time) {
        video.prop('currentTime', time);
      }
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    define('walkthrough',["util", "ui", "jquery", "windowing", "templates", "templating", "session", "peers"], function (util, ui, $, windowing, templates, templating, session, peers) {
      var assert = util.assert;
      var walkthrough = util.Module("walkthrough");
      var onHideAll = null;
      var container = null;
    
      var slides = null;
    
      walkthrough.start = function (firstTime, doneCallback) {
        if (! container) {
          container = $(templates.walkthrough);
          container.hide();
          ui.container.append(container);
          slides = container.find(".togetherjs-walkthrough-slide");
          slides.hide();
          var progress = $("#togetherjs-walkthrough-progress");
          slides.each(function (index) {
            var bullet = templating.sub("walkthrough-slide-progress");
            progress.append(bullet);
            bullet.click(function () {
              show(index);
            });
          });
          container.find("#togetherjs-walkthrough-previous").click(previous);
          container.find("#togetherjs-walkthrough-next").click(next);
          ui.prepareShareLink(container);
          container.find(".togetherjs-self-name").bind("keyup", function (event) {
            var val = $(event.target).val();
            peers.Self.update({name: val});
          });
          container.find(".togetherjs-swatch").click(function () {
            var picker = $("#togetherjs-pick-color");
            if (picker.is(":visible")) {
              picker.hide();
              return;
            }
            picker.show();
            picker.find(".togetherjs-swatch-active").removeClass("togetherjs-swatch-active");
            picker.find(".togetherjs-swatch[data-color=\"" + peers.Self.color + "\"]").addClass("togetherjs-swatch-active");
            var location = container.find(".togetherjs-swatch").offset();
            picker.css({
              top: location.top,
              // The -7 comes out of thin air, but puts it in the right place:
              left: location.left-7
            });
          });
          if (session.isClient) {
            container.find(".togetherjs-if-creator").remove();
            container.find(".togetherjs-ifnot-creator").show();
          } else {
            container.find(".togetherjs-if-creator").show();
            container.find(".togetherjs-ifnot-creator").remove();
          }
          TogetherJS.config.track("siteName", function (value) {
            value = value || document.title;
            container.find(".togetherjs-site-name").text(value);
          });
          ui.activateAvatarEdit(container, {
            onSave: function () {
              container.find("#togetherjs-avatar-when-saved").show();
              container.find("#togetherjs-avatar-when-unsaved").hide();
            },
            onPending: function () {
              container.find("#togetherjs-avatar-when-saved").hide();
              container.find("#togetherjs-avatar-when-unsaved").show();
            }
          });
          // This triggers substititions in the walkthrough:
          peers.Self.update({});
          session.emit("new-element", container);
        }
        assert(typeof firstTime == "boolean", "You must provide a firstTime boolean parameter");
        if (firstTime) {
          container.find(".togetherjs-walkthrough-firsttime").show();
          container.find(".togetherjs-walkthrough-not-firsttime").hide();
        } else {
          container.find(".togetherjs-walkthrough-firsttime").hide();
          container.find(".togetherjs-walkthrough-not-firsttime").show();
        }
        onHideAll = doneCallback;
        show(0);
        windowing.show(container);
      };
    
      function show(index) {
        slides.hide();
        $(slides[index]).show();
        var bullets = container.find("#togetherjs-walkthrough-progress .togetherjs-walkthrough-slide-progress");
        bullets.removeClass("togetherjs-active");
        $(bullets[index]).addClass("togetherjs-active");
        var $next = $("#togetherjs-walkthrough-next").removeClass("togetherjs-disabled");
        var $previous = $("#togetherjs-walkthrough-previous").removeClass("togetherjs-disabled");
        if (index == slides.length - 1) {
          $next.addClass("togetherjs-disabled");
        } else if (index === 0) {
          $previous.addClass("togetherjs-disabled");
        }
      }
    
      function previous() {
        var index = getIndex();
        index--;
        if (index < 0) {
          index = 0;
        }
        show(index);
      }
    
      function next() {
        var index = getIndex();
        index++;
        if (index >= slides.length) {
          index = slides.length-1;
        }
        show(index);
      }
    
      function getIndex() {
        var active = slides.filter(":visible");
        if (! active.length) {
          return 0;
        }
        for (var i=0; i<slides.length; i++) {
          if (slides[i] == active[0]) {
            return i;
          }
        }
        return 0;
      }
    
      walkthrough.stop = function () {
        windowing.hide(container);
        if (onHideAll) {
          onHideAll();
          onHideAll = null;
        }
      };
    
      session.on("hide-window", function () {
        if (onHideAll) {
          onHideAll();
          onHideAll = null;
        }
      });
    
      return walkthrough;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    
    // WebRTC support -- Note that this relies on parts of the interface code that usually goes in ui.js
    
    define('webrtc',["require", "jquery", "util", "session", "ui", "peers", "storage", "windowing"], function (require, $, util, session, ui, peers, storage, windowing) {
      var webrtc = util.Module("webrtc");
      var assert = util.assert;
    
      session.RTCSupported = !!(window.mozRTCPeerConnection ||
                                window.webkitRTCPeerConnection ||
                                window.RTCPeerConnection);
    
      if (session.RTCSupported && $.browser.mozilla && parseInt($.browser.version, 10) <= 19) {
        // In a few versions of Firefox (18 and 19) these APIs are present but
        // not actually usable
        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=828839
        // Because they could be pref'd on we'll do a quick check:
        try {
          (function () {
            var conn = new window.mozRTCPeerConnection();
          })();
        } catch (e) {
          session.RTCSupported = false;
        }
      }
    
      var mediaConstraints = {
        mandatory: {
          OfferToReceiveAudio: true,
          OfferToReceiveVideo: false
        }
      };
      if (window.mozRTCPeerConnection) {
        mediaConstraints.mandatory.MozDontOfferDataChannel = true;
      }
    
      var URL = window.webkitURL || window.URL;
      var RTCSessionDescription = window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.RTCSessionDescription;
      var RTCIceCandidate = window.mozRTCIceCandidate || window.webkitRTCIceCandidate || window.RTCIceCandidate;
    
      function makePeerConnection() {
        // Based roughly off: https://github.com/firebase/gupshup/blob/gh-pages/js/chat.js
        if (window.webkitRTCPeerConnection) {
          return new webkitRTCPeerConnection({
            "iceServers": [{"url": "stun:stun.l.google.com:19302"}]
          }, {
            "optional": [{"DtlsSrtpKeyAgreement": true}]
          });
        }
        if (window.mozRTCPeerConnection) {
          return new mozRTCPeerConnection({
            // Or stun:124.124.124..2 ?
            "iceServers": [{"url": "stun:23.21.150.121"}]
          }, {
            "optional": []
          });
        }
        throw new util.AssertionError("Called makePeerConnection() without supported connection");
      }
    
      function ensureCryptoLine(sdp) {
        if (! window.mozRTCPeerConnection) {
          return sdp;
        }
    
        var sdpLinesIn = sdp.split('\r\n');
        var sdpLinesOut = [];
    
        // Search for m line.
        for (var i = 0; i < sdpLinesIn.length; i++) {
          sdpLinesOut.push(sdpLinesIn[i]);
          if (sdpLinesIn[i].search('m=') !== -1) {
            sdpLinesOut.push("a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
          }
        }
    
        sdp = sdpLinesOut.join('\r\n');
        return sdp;
      }
    
      function getUserMedia(options, success, failure) {
        failure = failure || function (error) {
          console.error("Error in getUserMedia:", error);
        };
        (navigator.getUserMedia ||
         navigator.mozGetUserMedia ||
         navigator.webkitGetUserMedia ||
         navigator.msGetUserMedia).call(navigator, options, success, failure);
      }
    
      /****************************************
       * getUserMedia Avatar support
       */
    
      session.on("ui-ready", function () {
        $("#togetherjs-self-avatar").click(function () {
          var avatar = peers.Self.avatar;
          if (avatar) {
            $preview.attr("src", avatar);
          }
          ui.displayToggle("#togetherjs-avatar-edit");
        });
        if (! session.RTCSupported) {
          $("#togetherjs-avatar-edit-rtc").hide();
        }
    
        var avatarData = null;
        var $preview = $("#togetherjs-self-avatar-preview");
        var $accept = $("#togetherjs-self-avatar-accept");
        var $cancel = $("#togetherjs-self-avatar-cancel");
        var $takePic = $("#togetherjs-avatar-use-camera");
        var $video = $("#togetherjs-avatar-video");
        var $upload = $("#togetherjs-avatar-upload");
    
        $takePic.click(function () {
          if (! streaming) {
            startStreaming();
            return;
          }
          takePicture();
        });
    
        function savePicture(dataUrl) {
          avatarData = dataUrl;
          $preview.attr("src", avatarData);
          $accept.attr("disabled", null);
        }
    
        $accept.click(function () {
          peers.Self.update({avatar:  avatarData});
          ui.displayToggle("#togetherjs-no-avatar-edit");
          // FIXME: these probably shouldn't be two elements:
          $("#togetherjs-participants-other").show();
          $accept.attr("disabled", "1");
        });
    
        $cancel.click(function () {
          ui.displayToggle("#togetherjs-no-avatar-edit");
          // FIXME: like above:
          $("#togetherjs-participants-other").show();
        });
    
        var streaming = false;
        function startStreaming() {
          getUserMedia({
              video: true,
              audio: false
            },
            function(stream) {
              streaming = true;
              $video[0].src = URL.createObjectURL(stream);
              $video[0].play();
            },
            function(err) {
              // FIXME: should pop up help or something in the case of a user
              // cancel
              console.error("getUserMedia error:", err);
            }
          );
        }
    
        function takePicture() {
          assert(streaming);
          var height = $video[0].videoHeight;
          var width = $video[0].videoWidth;
          width = width * (session.AVATAR_SIZE / height);
          height = session.AVATAR_SIZE;
          var $canvas = $("<canvas>");
          $canvas[0].height = session.AVATAR_SIZE;
          $canvas[0].width = session.AVATAR_SIZE;
          var context = $canvas[0].getContext("2d");
          context.arc(session.AVATAR_SIZE/2, session.AVATAR_SIZE/2, session.AVATAR_SIZE/2, 0, Math.PI*2);
          context.closePath();
          context.clip();
          context.drawImage($video[0], (session.AVATAR_SIZE - width) / 2, 0, width, height);
          savePicture($canvas[0].toDataURL("image/png"));
        }
    
        $upload.on("change", function () {
          var reader = new FileReader();
          reader.onload = function () {
            // FIXME: I don't actually know it's JPEG, but it's probably a
            // good enough guess:
            var url = "data:image/jpeg;base64," + util.blobToBase64(this.result);
            convertImage(url, function (result) {
              savePicture(result);
            });
          };
          reader.onerror = function () {
            console.error("Error reading file:", this.error);
          };
          reader.readAsArrayBuffer(this.files[0]);
        });
    
        function convertImage(imageUrl, callback) {
          var $canvas = $("<canvas>");
          $canvas[0].height = session.AVATAR_SIZE;
          $canvas[0].width = session.AVATAR_SIZE;
          var context = $canvas[0].getContext("2d");
          var img = new Image();
          img.src = imageUrl;
          // Sometimes the DOM updates immediately to call
          // naturalWidth/etc, and sometimes it doesn't; using setTimeout
          // gives it a chance to catch up
          setTimeout(function () {
            var width = img.naturalWidth || img.width;
            var height = img.naturalHeight || img.height;
            width = width * (session.AVATAR_SIZE / height);
            height = session.AVATAR_SIZE;
            context.drawImage(img, 0, 0, width, height);
            callback($canvas[0].toDataURL("image/png"));
          });
        }
    
      });
    
      /****************************************
       * RTC support
       */
    
      function audioButton(selector) {
        ui.displayToggle(selector);
        if (selector == "#togetherjs-audio-incoming") {
          $("#togetherjs-audio-button").addClass("togetherjs-animated").addClass("togetherjs-color-alert");
        } else {
          $("#togetherjs-audio-button").removeClass("togetherjs-animated").removeClass("togetherjs-color-alert");
        }
      }
    
      session.on("ui-ready", function () {
        $("#togetherjs-audio-button").click(function () {
          if ($("#togetherjs-rtc-info").is(":visible")) {
            windowing.hide();
            return;
          }
          if (session.RTCSupported) {
            enableAudio();
          } else {
            windowing.show("#togetherjs-rtc-not-supported");
          }
        });
    
        if (! session.RTCSupported) {
          audioButton("#togetherjs-audio-unavailable");
          return;
        }
        audioButton("#togetherjs-audio-ready");
    
        var audioStream = null;
        var accepted = false;
        var connected = false;
        var $audio = $("#togetherjs-audio-element");
        var offerSent = null;
        var offerReceived = null;
        var offerDescription = false;
        var answerSent = null;
        var answerReceived = null;
        var answerDescription = false;
        var _connection = null;
        var iceCandidate = null;
    
        function enableAudio() {
          accepted = true;
          storage.settings.get("dontShowRtcInfo").then(function (dontShow) {
            if (! dontShow) {
              windowing.show("#togetherjs-rtc-info");
            }
          });
          if (! audioStream) {
            startStreaming(connect);
            return;
          }
          if (! connected) {
            connect();
          }
          toggleMute();
        }
    
        ui.container.find("#togetherjs-rtc-info .togetherjs-dont-show-again").change(function () {
          storage.settings.set("dontShowRtcInfo", this.checked);
        });
    
        function error() {
          console.warn.apply(console, arguments);
          var s = "";
          for (var i=0; i<arguments.length; i++) {
            if (s) {
              s += " ";
            }
            var a = arguments[i];
            if (typeof a == "string") {
              s += a;
            } else {
              var repl;
              try {
                repl = JSON.stringify(a);
              } catch (e) {
              }
              if (! repl) {
                repl = "" + a;
              }
              s += repl;
            }
          }
          audioButton("#togetherjs-audio-error");
          // FIXME: this title doesn't seem to display?
          $("#togetherjs-audio-error").attr("title", s);
        }
    
        function startStreaming(callback) {
          getUserMedia(
            {
              video: false,
              audio: true
            },
            function (stream) {
              audioStream = stream;
              attachMedia("#togetherjs-local-audio", stream);
              if (callback) {
                callback();
              }
            },
            function (err) {
              // FIXME: handle cancel case
              if (err && err.code == 1) {
                // User cancel
                return;
              }
              error("getUserMedia error:", err);
            }
          );
        }
    
        function attachMedia(element, media) {
          element = $(element)[0];
          //console.log("Attaching", media, "to", element);
          if (window.mozRTCPeerConnection) {
            element.mozSrcObject = media;
            element.play();
          } else {
            element.autoplay = true;
            element.src = URL.createObjectURL(media);
          }
        }
    
        function getConnection() {
          assert(audioStream);
          if (_connection) {
            return _connection;
          }
          try {
            _connection = makePeerConnection();
          } catch (e) {
            error("Error creating PeerConnection:", e);
            throw e;
          }
          _connection.onaddstream = function (event) {
            //console.log("got event", event, event.type);
            attachMedia($audio, event.stream);
            audioButton("#togetherjs-audio-active");
          };
          _connection.onstatechange = function () {
            // FIXME: this doesn't seem to work:
            // Actually just doesn't work on Firefox
            //console.log("state change", _connection.readyState);
            if (_connection.readyState == "closed") {
              audioButton("#togetherjs-audio-ready");
            }
          };
          _connection.onicecandidate = function (event) {
            if (event.candidate) {
              session.send({
                type: "rtc-ice-candidate",
                candidate: {
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  sdpMid: event.candidate.sdpMid,
                  candidate: event.candidate.candidate
                }
              });
            }
          };
          _connection.addStream(audioStream);
          return _connection;
        }
    
        function addIceCandidate() {
          if (iceCandidate) {
            //console.log("adding ice", iceCandidate);
            _connection.addIceCandidate(new RTCIceCandidate(iceCandidate));
          }
        }
    
        function connect() {
          var connection = getConnection();
          if (offerReceived && (! offerDescription)) {
            connection.setRemoteDescription(
              new RTCSessionDescription({
                type: "offer",
                sdp: offerReceived
              }),
              function () {
                offerDescription = true;
                addIceCandidate();
                connect();
              },
              function (err) {
                error("Error doing RTC setRemoteDescription:", err);
              }
            );
            return;
          }
          if (! (offerSent || offerReceived)) {
            connection.createOffer(function (offer) {
              //console.log("made offer", offer);
              offer.sdp = ensureCryptoLine(offer.sdp);
              connection.setLocalDescription(
                offer,
                function () {
                  session.send({
                    type: "rtc-offer",
                    offer: offer.sdp
                  });
                  offerSent = offer;
                  audioButton("#togetherjs-audio-outgoing");
                },
                function (err) {
                  error("Error doing RTC setLocalDescription:", err);
                },
                mediaConstraints
              );
            }, function (err) {
              error("Error doing RTC createOffer:", err);
            });
          } else if (! (answerSent || answerReceived)) {
            // FIXME: I might have only needed this due to my own bugs, this might
            // not actually time out
            var timeout = setTimeout(function () {
              if (! answerSent) {
                error("createAnswer Timed out; reload or restart browser");
              }
            }, 2000);
            connection.createAnswer(function (answer) {
              answer.sdp = ensureCryptoLine(answer.sdp);
              clearTimeout(timeout);
              connection.setLocalDescription(
                answer,
                function () {
                  session.send({
                    type: "rtc-answer",
                    answer: answer.sdp
                  });
                  answerSent = answer;
                },
                function (err) {
                  clearTimeout(timeout);
                  error("Error doing RTC setLocalDescription:", err);
                },
                mediaConstraints
              );
            }, function (err) {
              error("Error doing RTC createAnswer:", err);
            });
          }
        }
    
        function toggleMute() {
          // FIXME: implement.  Actually, wait for this to be implementable - currently
          // muting of localStreams isn't possible
          // FIXME: replace with hang-up?
        }
    
        session.hub.on("rtc-offer", function (msg) {
          if (offerReceived || answerSent || answerReceived || offerSent) {
            abort();
          }
          offerReceived = msg.offer;
          if (! accepted) {
            audioButton("#togetherjs-audio-incoming");
            return;
          }
          function run() {
            var connection = getConnection();
            connection.setRemoteDescription(
              new RTCSessionDescription({
                type: "offer",
                sdp: offerReceived
              }),
              function () {
                offerDescription = true;
                addIceCandidate();
                connect();
              },
              function (err) {
                error("Error doing RTC setRemoteDescription:", err);
              }
            );
          }
          if (! audioStream) {
            startStreaming(run);
          } else {
            run();
          }
        });
    
        session.hub.on("rtc-answer", function (msg) {
          if (answerSent || answerReceived || offerReceived || (! offerSent)) {
            abort();
            // Basically we have to abort and try again.  We'll expect the other
            // client to restart when appropriate
            session.send({type: "rtc-abort"});
            return;
          }
          answerReceived = msg.answer;
          assert(offerSent);
          assert(audioStream);
          var connection = getConnection();
          connection.setRemoteDescription(
            new RTCSessionDescription({
              type: "answer",
              sdp: answerReceived
            }),
            function () {
              answerDescription = true;
              // FIXME: I don't think this connect is ever needed?
              connect();
            },
            function (err) {
              error("Error doing RTC setRemoteDescription:", err);
            }
          );
        });
    
        session.hub.on("rtc-ice-candidate", function (msg) {
          iceCandidate = msg.candidate;
          if (offerDescription || answerDescription) {
            addIceCandidate();
          }
        });
    
        session.hub.on("rtc-abort", function (msg) {
          abort();
          if (! accepted) {
            return;
          }
          if (! audioStream) {
            startStreaming(function () {
              connect();
            });
          } else {
            connect();
          }
        });
    
        session.hub.on("hello", function (msg) {
          // FIXME: displayToggle should be set due to
          // _connection.onstatechange, but that's not working, so
          // instead:
          audioButton("#togetherjs-audio-ready");
          if (accepted && (offerSent || answerSent)) {
            abort();
            connect();
          }
        });
    
        function abort() {
          answerSent = answerReceived = offerSent = offerReceived = null;
          answerDescription = offerDescription = false;
          _connection = null;
          $audio[0].removeAttribute("src");
        }
    
      });
    
      return webrtc;
    
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http://mozilla.org/MPL/2.0/. */
    define('who',["util", "channels", "session", "ui"], function (util, channels, session, ui) {
      var assert = util.assert;
      var who = util.Module("who");
      var MAX_RESPONSE_TIME = 5000;
      var MAX_LATE_RESPONSE = 2000;
    
      who.getList = function (hubUrl) {
        return util.Deferred(function (def) {
          var expected;
          var channel = channels.WebSocketChannel(hubUrl);
          var users = {};
          var responded = 0;
          var firstResponse = 0;
          var lateResponseTimeout;
          channel.onmessage = function (msg) {
            if (msg.type == "init-connection") {
              expected = msg.peerCount;
            }
            if (msg.type == "who") {
              // Our message back to ourselves probably
              firstResponse = setTimeout(function () {
                close();
              }, MAX_LATE_RESPONSE);
            }
            if (msg.type == "hello-back") {
              if (! users[msg.clientId]) {
                users[msg.clientId] = who.ExternalPeer(msg.clientId, msg);
                responded++;
                if (expected && responded >= expected) {
                  close();
                } else {
                  def.notify(users);
                }
              }
            }
            //console.log("users", users);
          };
          channel.send({
            type: "who",
            "server-echo": true,
            clientId: null
          });
          var timeout = setTimeout(function () {
            close();
          }, MAX_RESPONSE_TIME);
          function close() {
            if (timeout) {
              clearTimeout(timeout);
            }
            if (lateResponseTimeout) {
              clearTimeout(lateResponseTimeout);
            }
            channel.close();
            def.resolve(users);
          }
        });
      };
    
      who.invite = function (hubUrl, clientId) {
        return util.Deferred(function (def) {
          var channel = channels.WebSocketChannel(hubUrl);
          var id = util.generateId();
          channel.onmessage = function (msg) {
            if (msg.type == "invite" && msg.inviteId == id) {
              channel.close();
              def.resolve();
            }
          };
          var userInfo = session.makeHelloMessage(false);
          delete userInfo.type;
          userInfo.clientId = session.clientId;
          channel.send({
            type: "invite",
            inviteId: id,
            url: session.shareUrl(),
            userInfo: userInfo,
            forClientId: clientId,
            clientId: null,
            "server-echo": true
          });
        });
      };
    
      who.ExternalPeer = util.Class({
        isSelf: false,
        isExternal: true,
        constructor: function (id, attrs) {
          attrs = attrs || {};
          assert(id);
          this.id = id;
          this.identityId = attrs.identityId || null;
          this.status = attrs.status || "live";
          this.idle = attrs.status || "active";
          this.name = attrs.name || null;
          this.avatar = attrs.avatar || null;
          this.color = attrs.color || "#00FF00";
          this.lastMessageDate = 0;
          this.view = ui.PeerView(this);
        },
    
        className: function (prefix) {
          prefix = prefix || "";
          return prefix + util.safeClassName(this.id);
        }
    
      });
    
      return who;
    });
    
    /* This Source Code Form is subject to the terms of the Mozilla Public
     * License, v. 2.0. If a copy of the MPL was not distributed with this file,
     * You can obtain one at http:// mozilla.org/MPL/2.0/. */
    
    define('youtubeVideos',["jquery", "util", "session", "elementFinder"],
    function ($, util, session, elementFinder) {
    
      // constant var to indicate whether two players are too far apart in sync
      var TOO_FAR_APART = 3000;
      // embedded youtube iframes
      var youTubeIframes = [];
      // youtube API load delay
      var API_LOADING_DELAY = 2000;
    
      session.on("reinitialize", function () {
        if (TogetherJS.config.get("youtube")) {
          prepareYouTube();
        }
      });
    
      session.on("close", function () {
        $(youTubeIframes).each(function (i, iframe) {
          // detach players from iframes
          $(iframe).removeData("togetherjs-player");
          $(iframe).removeData("dontPublish");
          $(iframe).removeData("currentVideoId");
          // disable iframeAPI
          $(iframe).removeAttr("enablejsapi");
          // remove unique youtube iframe indicators
          var id = $(iframe).attr("id") || "";
          if (id.indexOf("youtube-player") === 0) {
            // An id we added
            $(iframe).removeAttr("id");
          }
          youTubeIframes = [];
        });
      });
    
      TogetherJS.config.track("youtube", function (track, previous) {
        if (track && ! previous) {
          prepareYouTube();
          // You can enable youtube dynamically, but can't turn it off:
          TogetherJS.config.close("youtube");
        }
      });
    
      function prepareYouTube() {
        // setup iframes first
        setupYouTubeIframes();
    
        // this function should be global so it can be called when API is loaded
        window.onYouTubeIframeAPIReady = function() {
          // YouTube API is ready
          $(youTubeIframes).each(function (i, iframe) {
            var player = new YT.Player(iframe.id, { // get the reference to the already existing iframe
              events: {
                'onReady': insertPlayer,
                'onStateChange': publishPlayerStateChange
              }
            });
          });
        };
    
        if (window.YT === undefined) {
          // load necessary API
          // it calls onYouTubeIframeAPIReady automatically when the API finishes loading
          var tag = document.createElement('script');
          tag.src = "https://www.youtube.com/iframe_api";
          var firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          // manually invoke APIReady function when the API was already loaded by user
          onYouTubeIframeAPIReady();
        }
    
        // give each youtube iframe a unique id and set its enablejsapi param to true
        function setupYouTubeIframes() {
          var iframes = $('iframe');
          iframes.each(function (i, iframe) {
            // if the iframe's unique id is already set, skip it
            // FIXME: what if the user manually sets an iframe's id (i.e. "#my-youtube")?
            // maybe we should set iframes everytime togetherjs is reinitialized?
            if (($(iframe).attr("src") || "").indexOf("youtube") != -1 && !$(iframe).attr("id")) {
              $(iframe).attr("id", "youtube-player"+i);
              $(iframe).attr("enablejsapi", 1);
              youTubeIframes[i] = iframe;
            }
          });
        } // iframes are ready
    
        function insertPlayer(event) {
          // only when it is READY, attach a player to its iframe
          var currentPlayer = event.target;
          var currentIframe = currentPlayer.a;
          // check if a player is already attached in case of being reinitialized
          if (!$(currentIframe).data("togetherjs-player")) {
            $(currentIframe).data("togetherjs-player", currentPlayer);
            // initialize its dontPublish flag as well
            $(currentIframe).data("dontPublish", false);
            // store its current video's id
            var currentVideoId = getVideoIdFromUrl(currentPlayer.getVideoUrl());
            $(currentIframe).data("currentVideoId", currentVideoId);
          }
        }
      } // end of prepareYouTube
    
      function publishPlayerStateChange(event) {
        var target = event.target; 
        var currentIframe = target.a;
        // FIXME: player object retrieved from event.target has an incomplete set of essential functions
        // this is most likely due to a recently-introduced problem with current YouTube API as others have been reporting the same issue (12/18/`13)
        //var currentPlayer = target;
        //var currentTime = currentPlayer.getCurrentTime();
        var currentPlayer = $(currentIframe).data("togetherjs-player");
        var currentTime = target.k.currentTime;
        var iframeLocation = elementFinder.elementLocation(currentIframe);
    
        if ($(currentPlayer).data("seek")) {
          $(currentPlayer).removeData("seek");
          return;
        }
    
        // do not publish if playerState was changed by other users
        if ($(currentIframe).data("dontPublish")) {
          // make it false again so it can start publishing events of its own state changes
          $(currentIframe).data("dontPublish", false);
          return;
        }
    
        // notify other people that I changed the player state
        if (event.data == YT.PlayerState.PLAYING) {
    
          var currentVideoId = isDifferentVideoLoaded(currentIframe);
          if (currentVideoId) {
            // notify that I just loaded another video
            publishDifferentVideoLoaded(iframeLocation, currentVideoId);
            // update current video id
            $(currentIframe).data("currentVideoId", currentVideoId);
          } else {
            session.send({
              type: "playerStateChange",
              element: iframeLocation,
              playerState: 1,
              playerTime: currentTime
            });
          }
        } else if (event.data == YT.PlayerState.PAUSED) {
          session.send({
            type: "playerStateChange",
            element: iframeLocation,
            playerState: 2,
            playerTime: currentTime
          });
        } else {
          // do nothing when the state is buffering, cued, or ended
          return;
        }
      }
    
      function publishDifferentVideoLoaded(iframeLocation, videoId) {
        session.send({
          type: "differentVideoLoaded",
          videoId: videoId,
          element: iframeLocation
        });
      }
    
      session.hub.on('playerStateChange', function (msg) {
        var iframe = elementFinder.findElement(msg.element);
        var player = $(iframe).data("togetherjs-player");
        var currentTime = player.getCurrentTime();
        var currentState = player.getPlayerState();
    
        if (currentState != msg.playerState) {
          $(iframe).data("dontPublish", true);
        }
    
        if (msg.playerState == 1) {
          player.playVideo();
          // seekTo() updates the video's time and plays it if it was already playing
          // and pauses it if it was already paused
          if (areTooFarApart(currentTime, msg.playerTime)) {
            player.seekTo(msg.playerTime, true);
          }
        } else if (msg.playerState == 2) {
          // When YouTube videos are advanced while playing,
          // Chrome: pause -> pause -> play (onStateChange is called even when it is from pause to pause)
          // FireFox: buffering -> play -> buffering -> play
          // We must prevent advanced videos from going out of sync
          player.pauseVideo();
          if (areTooFarApart(currentTime, msg.playerTime)) {
            // "seek" flag will help supress publishing unwanted state changes
            $(player).data("seek", true);
            player.seekTo(msg.playerTime, true);
          }
        }
      });
    
      // if a late user joins a channel, synchronize his videos
      session.hub.on('hello', function () {
        // wait a couple seconds to make sure the late user has finished loading API
        setTimeout(synchronizeVideosOfLateGuest, API_LOADING_DELAY);
      });
    
      session.hub.on('synchronizeVideosOfLateGuest', function (msg) {
        var iframe = elementFinder.findElement(msg.element);
        var player = $(iframe).data("togetherjs-player");
        // check if another video had been loaded to an existing iframe before I joined
        var currentVideoId = $(iframe).data("currentVideoId");
        if (msg.videoId != currentVideoId) {
          $(iframe).data("currentVideoId", msg.videoId);
          player.loadVideoById(msg.videoId, msg.playerTime, 'default');
        } else {
          // if the video is only cued, I do not have to do anything to sync
          if (msg.playerState != 5) {
            player.seekTo(msg.playerTime, true);
          }
        }
      });
    
      session.hub.on('differentVideoLoaded', function (msg) {
        // load a new video if the host has loaded one
        var iframe = elementFinder.findElement(msg.element);
        var player = $(iframe).data("togetherjs-player");
        player.loadVideoById(msg.videoId, 0, 'default');
        $(iframe).data("currentVideoId", msg.videoId);
    
      });
    
      function synchronizeVideosOfLateGuest() {
        youTubeIframes.forEach(function (iframe) {
          var currentPlayer = $(iframe).data("togetherjs-player");
          var currentVideoId = getVideoIdFromUrl(currentPlayer.getVideoUrl());
          var currentState = currentPlayer.getPlayerState();
          var currentTime = currentPlayer.getCurrentTime();
          var iframeLocation = elementFinder.elementLocation(iframe);
          session.send({
            type: "synchronizeVideosOfLateGuest",
            element: iframeLocation,
            videoId: currentVideoId,
            playerState: currentState, //this might be necessary later
            playerTime: currentTime
          });
        });
      }
    
      function isDifferentVideoLoaded(iframe) {
        var lastVideoId = $(iframe).data("currentVideoId");
        var currentPlayer = $(iframe).data("togetherjs-player");
        var currentVideoId = getVideoIdFromUrl(currentPlayer.getVideoUrl());
    
        // since url forms of iframe src and player's video url are different,
        // I have to compare the video ids
        if (currentVideoId != lastVideoId) {
          return currentVideoId;
        } else {
          return false;
        }
      }
    
      // parses videoId from the url returned by getVideoUrl function
      function getVideoIdFromUrl(videoUrl) {
        var videoId = videoUrl.split('v=')[1];
        //Chrome and Firefox have different positions for parameters
        var ampersandIndex = videoId.indexOf('&');
        if (ampersandIndex != -1) {
          videoId = videoId.substring(0, ampersandIndex);
        }
        return videoId;
      }
    
      function areTooFarApart(myTime, theirTime) {
        var secDiff = Math.abs(myTime - theirTime);
        var milliDiff = secDiff * 1000;
        return milliDiff > TOO_FAR_APART;
      }
    });
    TogetherJS.require = TogetherJS._requireObject = require;
    TogetherJS._loaded = true;
    require(["session"]);
    }());