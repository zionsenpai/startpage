const CONFIG = {
    commandPathDelimiter: "/",
    commandSearchDelimiter: " ",
    defaultSearchTemplate: "https://duckduckgo.com/?q={}",
    openLinksInNewTab: true,
    suggestionLimit: 4,
  };

  const COMMANDS = new Map([
    ["d", { name: "Drive", url: "https://drive.google.com" }],
    ["c", { name: "Calendar", url: "https://calendar.google.com" }],
    ["k", { name: "Keep", url: "https://keep.google.com" }],
    ["n", { name: "Notion", url: "https://www.notion.so" }],
    ["m", { name: "Proton", url: "https://mail.proton.me/u/0/inbox" }],
    ["f", { name: "Figma", url: "https://www.figma.com" }],
    ["o", { name: "Coursera", url: "https://www.coursera.org" }],
    ["p", { url: "file:///Users/cade/Projects/pomodoro/index.html" }],
    [
      "y",
      {
        name: "YouTube",
        searchTemplate: "/results?search_query={}",
        url: "https://youtube.com/feed/subscriptions",
      },
    ],
    ["r", { name: "Reddit", url: "https://reddit.com" }],
    [
      "v",
      {
        name: "Vercel",
        suggestions: ["sdk.vercel.ai"],
        url: "https://vercel.com/dashboard",
      },
    ],
    ["g", { name: "GitHub", url: "https://github.com" }],
    [
      "0",
      {
        name: "local",
        searchTemplate: ":{}",
        suggestions: ["0 54323", "0 54324"],
        url: "http://localhost:3000",
      },
    ],
  ]);

class Commands extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const template = document.getElementById("commands-template");
      const clone = template.content.cloneNode(true);
      const commands = clone.querySelector(".commands");
      const commandTemplate = document.getElementById("command-template");

      for (const [key, { name, url }] of COMMANDS.entries()) {
        if (!name || !url) continue;
        const clone = commandTemplate.content.cloneNode(true);
        const command = clone.querySelector(".command");
        command.href = url;
        if (CONFIG.openLinksInNewTab) command.target = "_blank";
        clone.querySelector(".key").innerText = key;
        clone.querySelector(".name").innerText = name;
        commands.append(clone);
      }

      this.shadowRoot.append(clone);
    }
  }

  customElements.define("commands-component", Commands);

class Search extends HTMLElement {
    #dialog;
    #form;
    #input;
    #suggestions;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const template = document.getElementById("search-template");
      const clone = template.content.cloneNode(true);
      this.#dialog = clone.querySelector(".dialog");
      this.#form = clone.querySelector(".form");
      this.#input = clone.querySelector(".input");
      this.#suggestions = clone.querySelector(".suggestions");
      this.#form.addEventListener("submit", this.#onSubmit, false);
      this.#input.addEventListener("input", this.#onInput);
      this.#suggestions.addEventListener("click", this.#onSuggestionClick);
      document.addEventListener("keydown", this.#onKeydown);
      this.shadowRoot.append(clone);
    }

    static #attachSearchPrefix(array, { key, splitBy }) {
      if (!splitBy) return array;
      return array.map((search) => `${key}${splitBy}${search}`);
    }

    static #escapeRegexCharacters(s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    }

    static #fetchDuckDuckGoSuggestions(search) {
      return new Promise((resolve) => {
        window.autocompleteCallback = (res) => {
          const suggestions = [];

          for (const item of res) {
            if (item.phrase === search.toLowerCase()) continue;
            suggestions.push(item.phrase);
          }

          resolve(suggestions);
        };

        const script = document.createElement("script");
        document.querySelector("head").appendChild(script);
        script.src = `https://duckduckgo.com/ac/?callback=autocompleteCallback&q=${search}`;
        script.onload = script.remove;
      });
    }

    static #formatSearchUrl(url, searchPath, search) {
      if (!searchPath) return url;
      const [baseUrl] = Search.#splitUrl(url);
      const urlQuery = encodeURIComponent(search);
      searchPath = searchPath.replace(/{}/g, urlQuery);
      return baseUrl + searchPath;
    }

    static #hasProtocol(s) {
      return /^[a-zA-Z]+:\/\//i.test(s);
    }

    static #isUrl(s) {
      return /^((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)$/i.test(s);
    }

    static #parseQuery = (raw) => {
      const query = raw.trim();

      if (this.#isUrl(query)) {
        const url = this.#hasProtocol(query) ? query : `https://${query}`;
        return { query, url };
      }

      if (COMMANDS.has(query)) {
        const { command, key, url } = COMMANDS.get(query);
        return command ? Search.#parseQuery(command) : { key, query, url };
      }

      let splitBy = CONFIG.commandSearchDelimiter;
      const [searchKey, rawSearch] = query.split(new RegExp(`${splitBy}(.*)`));

      if (COMMANDS.has(searchKey)) {
        const { searchTemplate, url: base } = COMMANDS.get(searchKey);
        const search = rawSearch.trim();
        const url = Search.#formatSearchUrl(base, searchTemplate, search);
        return { key: searchKey, query, search, splitBy, url };
      }

      splitBy = CONFIG.commandPathDelimiter;
      const [pathKey, path] = query.split(new RegExp(`${splitBy}(.*)`));

      if (COMMANDS.has(pathKey)) {
        const { url: base } = COMMANDS.get(pathKey);
        const [baseUrl] = Search.#splitUrl(base);
        const url = `${baseUrl}/${path}`;
        return { key: pathKey, path, query, splitBy, url };
      }

      const [baseUrl, rest] = Search.#splitUrl(CONFIG.defaultSearchTemplate);
      const url = Search.#formatSearchUrl(baseUrl, rest, query);
      return { query, search: query, url };
    };

    static #splitUrl(url) {
      const parser = document.createElement("a");
      parser.href = url;
      const baseUrl = `${parser.protocol}//${parser.hostname}`;
      const rest = `${parser.pathname}${parser.search}`;
      return [baseUrl, rest];
    }

    #close() {
      this.#input.value = "";
      this.#input.blur();
      this.#dialog.close();
      this.#suggestions.innerHTML = "";
    }

    #execute(query) {
      const { url } = Search.#parseQuery(query);
      const target = CONFIG.openLinksInNewTab ? "_blank" : "_self";
      window.open(url, target, "noopener noreferrer");
      this.#close();
    }

    #focusNextSuggestion(previous = false) {
      const active = this.shadowRoot.activeElement;
      let nextIndex;

      if (active.dataset.index) {
        const activeIndex = Number(active.dataset.index);
        nextIndex = previous ? activeIndex - 1 : activeIndex + 1;
      } else {
        nextIndex = previous ? this.#suggestions.childElementCount - 1 : 0;
      }

      const next = this.#suggestions.children[nextIndex];
      if (next) next.querySelector(".suggestion").focus();
      else this.#input.focus();
    }

    #onInput = async () => {
      const oq = Search.#parseQuery(this.#input.value);

      if (!oq.query) {
        this.#close();
        return;
      }

      let suggestions = COMMANDS.get(oq.query)?.suggestions ?? [];

      if (oq.search && suggestions.length < CONFIG.suggestionLimit) {
        const res = await Search.#fetchDuckDuckGoSuggestions(oq.search);
        const formatted = Search.#attachSearchPrefix(res, oq);
        suggestions = suggestions.concat(formatted);
      }

      const nq = Search.#parseQuery(this.#input.value);
      if (nq.query !== oq.query) return;
      this.#renderSuggestions(suggestions, oq.query);
    };

    #onKeydown = (e) => {
      if (!this.#dialog.open) {
        this.#dialog.show();
        this.#input.focus();

        requestAnimationFrame(() => {
          // close the search dialog before the next repaint if a character is
          // not produced (e.g. if you type shift, control, alt etc.)
          if (!this.#input.value) this.#close();
        });

        return;
      }

      if (e.key === "Escape") {
        this.#close();
        return;
      }

      const alt = e.altKey ? "alt-" : "";
      const ctrl = e.ctrlKey ? "ctrl-" : "";
      const meta = e.metaKey ? "meta-" : "";
      const shift = e.shiftKey ? "shift-" : "";
      const modifierPrefixedKey = `${alt}${ctrl}${meta}${shift}${e.key}`;

      if (/^(ArrowDown|Tab|ctrl-n)$/.test(modifierPrefixedKey)) {
        e.preventDefault();
        this.#focusNextSuggestion();
        return;
      }

      if (/^(ArrowUp|ctrl-p|shift-Tab)$/.test(modifierPrefixedKey)) {
        e.preventDefault();
        this.#focusNextSuggestion(true);
      }
    };

    #onSubmit = () => {
      this.#execute(this.#input.value);
    };

    #onSuggestionClick = (e) => {
      const ref = e.target.closest(".suggestion");
      if (!ref) return;
      this.#execute(ref.dataset.suggestion);
    };

    #renderSuggestions(suggestions, query) {
      this.#suggestions.innerHTML = "";
      const sliced = suggestions.slice(0, CONFIG.suggestionLimit);
      const template = document.getElementById("suggestion-template");

      for (const [index, suggestion] of sliced.entries()) {
        const clone = template.content.cloneNode(true);
        const ref = clone.querySelector(".suggestion");
        ref.dataset.index = index;
        ref.dataset.suggestion = suggestion;
        const escapedQuery = Search.#escapeRegexCharacters(query);
        const matched = suggestion.match(new RegExp(escapedQuery, "i"));

        if (matched) {
          const template = document.getElementById("match-template");
          const clone = template.content.cloneNode(true);
          const matchRef = clone.querySelector(".match");
          const pre = suggestion.slice(0, matched.index);
          const post = suggestion.slice(matched.index + matched[0].length);
          matchRef.innerText = matched[0];
          matchRef.insertAdjacentHTML("beforebegin", pre);
          matchRef.insertAdjacentHTML("afterend", post);
          ref.append(clone);
        } else {
          ref.innerText = suggestion;
        }

        this.#suggestions.append(clone);
      }
    }
  }

  customElements.define("search-component", Search);






  window.onload = function() {
    this.populateVersionInSettings();
    this.initBody();
    this.listenForSettings();
}


debug = false; // Enable while testing on local
searchBarDivId = "search-bar"
searchBarId = "search-bar-input"
messageDivId = "message"
dateDivId = "date"
dateId = "date-text"
weatherId = "weather-text"
lineId = "line"
messageId = "message-text"
timeZ = undefined
otherContentId = "other-content"
userName = ""
disable24Hour = false;
appId = "fd2c04ed7f9802656bd2cc23bddc7ad9"
apiUrl = "http://api.openweathermap.org/data/2.5/weather"
bgClassContainer = [
    "media",
    "work",
    "social",
    "others",
    "funky",
    "purple",
    "upvoty",
    "indigo",
    "foxxy"
]
searchEngines = {
    "Google": "https://www.google.com/search?q=",
    "DuckDuckGo": "https://duckduckgo.com/?q=",
    "Bing": "https://www.bing.com/search?q=",
    "Yahoo": "https://search.yahoo.com/search?p=",
    "Ecosia": "https://www.ecosia.org/search?q=",
    "Startpage": "https://startpage.com/do/search?query=",
    "Yandex": "https://yandex.com/search/?text=",
    "Qwant": "https://www.qwant.com/?q=",
    "Baidu": "https://www.baidu.com/s?wd=",
    "Brave": "https://search.brave.com/search?q="
}
validWeatherUnit = [
    "fah", "cel"
]
validQuickLinks = {}


function initBody() {
    /**
     * Function called when the body is loaded.
     * 
     * Do everything like adding an event listener to
     * other things.
     */
    // If running on local, just read the conf
    if (debug) {
        readJSON("config.json");
        return;
    }

    // Read the json file
    BROWSER.storage.sync.get(result => {
        Object.keys(result).length == 0 ? readJSON("config.json") : parseAndCreate(result)
    })
}

function initSearchBar(jsonData) {
    // Clear the search bar on load, just in case
    document.getElementById(searchBarId).value = ""
    document.getElementById(searchBarId).focus()
    searchEngine = jsonData["searchEngine"]
    if(!Object.keys(this.searchEngines).includes(searchEngine)){
        searchEngine = "Google"
    }
    searchUrl = this.searchEngines[searchEngine]
    document.getElementById(searchBarId).placeholder = `Search something on ${searchEngine}`
    document.getElementById(searchBarId).addEventListener("keypress", (event) => {
        if (event.key != 'Enter') return

        // Do whatever the user wants to do
        query = document.getElementById(searchBarId).value

        // Open settings
        if (query == "--setting" || query == "--settings") {
            showSettings()
            document.getElementById(searchBarId).value = ""
            // Remove the autocomplete boxes
            document.getElementById("search-bar-input-autocomplete-list").style.display = "none";
            return
        }

        // Invoke quicklinks
        const wasInvoked = searchQuickLinks(query, jsonData)
        if (wasInvoked) return

        // If not others, then it's probably a search
        query = query.replace(/\ /g, "+")
        document.location = searchUrl + query
    })
}

function buildMsg() {
    /**
     * Build a nice message for the user.
     * 
     * Following is how the message would be decided.
     * 0 - 5:59 : It's too late, take some sleep
     * 6 - 8:59 : You're up early
     * 9 - 11:59 : Have a good day ahead
     * 12 - 16:59 : Good Afternoon
     * 17 - 19:59 : Good Evening
     * 20 - 23:59 : It's time to wrap up for the day
     */
    date = new Date()
    currentHour = date.getHours()
    currentMinute = date.getMinutes()
    currentTime = currentHour + (0.01 * currentMinute)

    if (inRange(currentTime, 0, 5.59))
        return "It's too late, take some sleep"
    if (inRange(currentTime, 6, 8.59))
        return "You're up early"
    if (inRange(currentTime, 9, 11.59))
        return "Have a good day ahead"
    if (inRange(currentTime, 12, 16.59))
        return "Good Afternoon"
    if (inRange(currentTime, 17, 19.59))
        return "Good Evening"
    if (inRange(currentTime, 20, 24))
        return "It's time to wrap up for the day"
    else
        return ""
}

function handleMessage(userName) {
    /**
     * Handle the creation of the message
     * 
     * Build the message based on the time of the day.
     * If the message is null then add just the username
     * Else, add the username before the message.
     */
    var builtMsg = buildMsg()
    builtMsg == "" ?
        builtMsg = `Hello ${userName}` : builtMsg = `Hey ${userName}, ${builtMsg}!`
    return builtMsg;
}

function updateTime() {
    /**
     * Get the current time and date and return it.
     */
    currentDate = new Date()
    options = {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: 'numeric',
            hour12: disable24Hour,
            timeZone: timeZ
    }
    finalDate = currentDate.toLocaleString(undefined, options)
    document.getElementById(dateId).textContent = finalDate
}

function updateTimeHook() {
    updateTime()
    interval = setInterval(() => {
        updateTime()
    }, 30 * 1000)
}

function updateWeather(weatherConfig) {
    /**
     * Get the weather using the location passed by the user using
     * the config and update it in a formatted way according to
     * the unit.
     */
    userLocation = weatherConfig["location"].replace(/\ /g, ",")
    passedUnit = weatherConfig["unit"]
    unit = validWeatherUnit.includes(passedUnit.substring(0, 3)) ?
        passedUnit : "cel"

    fetchUrl = apiUrl + `?q=${userLocation}&appid=${appId}&units=metric`

    fetch(fetchUrl)
        .then(response => {return response.json()})
        .then(jsonData => {
            temp = Math.floor(jsonData["main"]["temp"])
            weatherType = jsonData["weather"][0]["main"]

            temp = !unit.includes("cel") ?
                getFahrenheit(temp) + "&deg;F" : temp + "&deg;C"
            weatherText = temp + ", " + indexUppercase(weatherType)
            document.getElementById(weatherId).innerHTML = weatherText
        })
}

function readJSON(fileName) {
    // Load the data of the passed file.
    fetch(fileName)
        .then(response => {return response.json()})
        .then(jsonData => {
            parseAndCreate(jsonData)
            saveSettings(jsonData)
        })
}

function saveSettings(settings) {
    if (debug) return;

    BROWSER.storage.sync.set(settings)
}

function parseAndCreate(jsonData) {
    /**
     * Parse the passed jsonData and create div's accordingly.
     */
    this.userName = jsonData["user"]

    // Enable the settings button if it is enabled
    if (jsonData["settingsIcon"]) enableCog();

    // Set the page title if it is passed by the user
    if (jsonData["title"]) document.title = jsonData["title"]

    // If the user has not passed any custom message
    if (Object.keys(jsonData).includes("message") &&
            typeof(jsonData["message"]) == "string" &&
            jsonData["message"] != "")
        builtMsg = jsonData["message"]
    else
        builtMsg = this.handleMessage(this.userName);

    document.getElementById(messageId).textContent = builtMsg
    // Check if 24 hour is disabled
    disable24Hour = jsonData["disable24Hour"]
    timeZ = jsonData["timeZone"]
    timeZ = isValidTimeZone(timeZ) ? timeZ : undefined
    // Check if welcome message is supposed to be disabled
    if (jsonData["disableMessage"])
        document.getElementById(messageDivId).style.display = "none"
    if (jsonData["disableDate"]) {
        // Hide the date and the line
        document.getElementById(dateId).style.display = "none"
        document.getElementById(lineId).style.display = "none"
    }
    else
        updateTimeHook()
    if (jsonData["disableWeather"]){
        // Hide the date and the line
        document.getElementById(weatherId).style.display = "none"
        document.getElementById(lineId).style.display = "none"
    }
    else
        updateWeather(jsonData["weatherConf"])
    if (jsonData["disableSearchBar"])
        document.getElementById(searchBarDivId).style.display = "none"
    else
        initSearchBar(jsonData)

    sqrs = jsonData["squares"]

    globalNewTabEnabled = false
    passedNewTab = jsonData["linkInNewTab"]
    if (passedNewTab != undefined) {
        globalNewTabEnabled = passedNewTab
    }

    sqrs.forEach((element, index) => {
        sqr = createSqr(element, index, globalNewTabEnabled)
        document.getElementById(otherContentId).appendChild(sqr)
    })

    // Apply styling if present
    if (jsonData["style"]) {
        styleData = jsonData["style"]
        if (styleData["backgroundColor"]) {
            document.body.style.backgroundColor = styleData["backgroundColor"]
        }
        if (styleData["messageColor"]) {
            document.getElementById(messageId).style.color = styleData["messageColor"]
        }
        if (styleData["dateColor"]) {
            document.getElementById(dateId).style.color = styleData["dateColor"]
        }
        if (styleData["lineColor"]) {
            document.getElementById(lineId).style.color = styleData["lineColor"]
        }
        if (styleData["weatherColor"]) {
            document.getElementById(weatherId).style.color = styleData["weatherColor"]
        }
        if (styleData["searchColor"]) {
            document.getElementById(searchBarId).style.color = styleData["searchColor"]
        }
        if (styleData["searchBackgroundColor"]) {
            document.getElementById(searchBarId).style.backgroundColor = styleData["searchBackgroundColor"]
            autocompleteBackgroundColor = styleData["searchBackgroundColor"]
        }
        if (styleData["searchPlaceholderColor"]) {
            document.getElementById(searchBarId).classList.add(createPlaceholderStyleClass(styleData["searchPlaceholderColor"]));
        }
        if (styleData["autocompleteHighlightBackgroundColor"]) {
            addAutocompleteStyleClass(styleData["autocompleteHighlightBackgroundColor"]);
        }
        if (styleData["squareBackgroundColor"]) {
            elements = document.getElementsByClassName("sqr")
            var i;
            for (i = 0; i < elements.length; i++) {
                elements[i].style.backgroundColor = styleData["squareBackgroundColor"]
            }
        }
        if (styleData["squareColor"]) {
            elements = document.querySelectorAll(".sqr a")
            var i;
            for (i = 0; i < elements.length; i++) {
                elements[i].style.color = styleData["squareColor"]
            }
        }
    }

    // Extract the quicklinks from the sqrs
    extractQuickLinks(sqrs, jsonData["style"]);
}

function createSqr(sqrData, index, globalNewTabEnabled) {
    // Create a new square division with the passed element
    name = sqrData["name"];
    link = sqrData["url"];
    links = sqrData["links"];
    color = sqrData["color"];

    // Sometimes, the user might not have set a value for the color,
    // in which case it will be undefined.
    colorValid = (color == undefined) ? false : isColorValid(color);

    div = document.createElement("div")
    cls = document.createAttribute("class")
    div.setAttributeNode(cls)
    div.classList.add("sqr")

    if (colorValid)
        customClass = createClass(color);
    else if (index > bgClassContainer.length - 1)
        customClass = 'media';
    else
        customClass = bgClassContainer[index];

    div.classList.add(customClass);

    h4 = getTitle(name, link);

    div.appendChild(h4)

    links.forEach(element => {
        aName = element["name"]
        aHref = element["url"]
        
        // Idea is to give preference to
        // link specific newTab field over the global
        // one.
        //
        // As a fallback, the global value will be used.
        isNewTab = globalNewTabEnabled
        newTabValue = element["newTab"]

        if (newTabValue != undefined) {
            isNewTab = newTabValue
        }

        a = document.createElement("a")
        attrHref = document.createAttribute("href")
        attrHref.value = aHref

        if (isNewTab) {
            attrTarget = document.createAttribute("target")
            attrTarget.value = "_blank"
            a.setAttributeNode(attrTarget)
        }
        
        a.setAttributeNode(attrHref)

        a.textContent = aName

        div.appendChild(a)
    })

    return div
}

function getTitle(titleContent, linkHref=null) {
    /**
     * Create the title for the sqr card.
     * 
     * The card will be optionally clicable and will open
     * a new link.
     * 
     * If the link is not passed in the config then the title
     * will not be clickable.
     */
    h4 = document.createElement("h4");

    if (!linkHref) {
        h4.textContent = titleContent;
        return h4;
    }

    // If the link is passed, create a nested child
    a = document.createElement("a");
    a.setAttribute("href", linkHref);
    a.textContent = titleContent;

    h4.appendChild(a);
    return h4;
}

// Utility functions

function isValidTimeZone(tz) {
    if (!Intl || !Intl.DateTimeFormat().resolvedOptions().timeZone) {
        throw 'Time zones are not available in this environment';
    }

    try {
        Intl.DateTimeFormat(undefined, {timeZone: tz});
        return true;
    }
    catch (ex) {
        return false;
    }
}

function getFahrenheit(inCelcius) {
    return Math.floor((inCelcius * 9 / 5) + 32)
}

function indexUppercase(unformatted) {
    return unformatted.split(" ").map(w => {
        return w[0].toUpperCase() + w.substring(1)
    }).join(" ")
}

function inRange(number, min, max) {
    return (number >= min && number <= max)
}

function isColorValid(color) {
    /**
     * Check if the passed color is valid.
     * 
     * Currently supports only css color names
     * or hex colors having 3 or 6 characters.
     */
    // Check CSS match
    let defaultStyles = new Option().style;
    defaultStyles.color = color
    if (defaultStyles.color == color) return true;

    // In case the above failed, check if it's a hex
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

function createClass(color) {
    /**
     * Create a new class in a style and add it to
     * the head.
     * 
     * I did check other alternatives since adding something like
     * this in the innerHTML is not a preferred way to go,
     * especially since I'm building this as an extension,
     * however, there's no other way. 
     * 
     * Since I also want to add hover effects, there seriously
     * is no other way to do that without adding a style or using
     * a library (cannot/don't want to do that because this is an extension).
     */
    var style = document.createElement('style');
    const newClassName = `bg-${Math.random().toString(36).substring(7)}`;
    style.type = 'text/css';
    style.innerHTML = `.${newClassName} h4 {color: ${color} !important;} .${newClassName} a:hover {color: ${color} !important;}`;
    document.getElementsByTagName('head')[0].appendChild(style);

    return newClassName;
}

function createPlaceholderStyleClass(color) {
    /**
     * Create a new class with for placeholder styling.
     * 
     * This is pretty much a continuation of what has done preivously
     * in the createClass function.
     */
    var style = document.createElement('style');
    const newClassName = `bg-${Math.random().toString(36).substring(7)}`;
    style.type = 'text/css';
    style.innerHTML = `::placeholder { /* Chrome, Firefox, Opera, Safari 10.1+ */
        color: ${color} !important;
        opacity: 1; /* Firefox */
      }
      
      :-ms-input-placeholder { /* Internet Explorer 10-11 */
        color: ${color} !important;
      }
      
      ::-ms-input-placeholder { /* Microsoft Edge */color: ${color} !important;}`;
    document.getElementsByTagName('head')[0].appendChild(style);

    return newClassName;
}

function addAutocompleteStyleClass(color) {
    /**
     * Add some colors for the autocomplete classes in order to
     * keep. We need to add styles for :hover property so it is
     * easier to just inject some CSS.
     */
    var style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = `
    .autocomplete-item:hover {
        background: ${color} !important;
    }

    .autocomplete-active {
        background: ${color} !important;
    }
    `;
    document.getElementsByTagName('head')[0].appendChild(style);
}


function extractQuickLinks(passedSqrs, style) {
    /**
     * Extract the quicklinks passed in the config
     * 
     * Cache the quicklinks passed by the user in the config JSON
     * so that they can be used as a shortcut called from the
     * search bar.
     */
    passedSqrs.forEach(linksContainer => {
        linksContainer.links.forEach(linkObject => this.validQuickLinks[linkObject.name] = linkObject.url);
    });

    // Start the autocomplete
    autocomplete(document.getElementById("search-bar-input"), this.validQuickLinks, style);
}

// Listen to key click

function listenForSettings() {
    document.onkeyup = event => {
        // Show the settings if ctrl and , is pressed
        if (event.ctrlKey && event.which == 188)
            showSettings();
    }
}

// Handle the settings cog

function enableCog() {
    /**
     * Enable the settings cog.
     * 
     * It will be disabled by default, however, if the user
     * wishes to enable it through the config, it will be shown.
     * 
     * Once shown, we need to add some event listeners to it as
     * well so it works the right way.
     */
    settingsCogElement = document.getElementById("settings-cog");

    // Unhide it
    settingsCogElement.style.display = "block";

    // Add event listener
    settingsCogElement.onclick = function() {
        editor = showSettings()

        // Add an onclick listener to hide settings if the button is clicked
        // again.
        settingsCogElement.onclick = () => {
            hideSettings(editor);
        }
    }
}