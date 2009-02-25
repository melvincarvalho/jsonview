/**
 * @author Benjamin Hollis
 * 
 * This component provides a stream converter that can translate from JSON to HTML.
 * It is compatible with Firefox 3 and up, since it uses many components that are new
 * to Firefox 3.
 */

// Import XPCOMUtils to help set up our JSONView XPCOM component (new to FF3)
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// Import the JSON Parser (new to FF3)
Components.utils.import("resource://gre/modules/JSON.jsm");

// Let us use FUEL
var Application = Components.classes["@mozilla.org/fuel/application;1"].getService(Components.interfaces.fuelIApplication);

/* 
 * The JSONFormatter helper object. This contains two major functions, jsonToHTML and errorPage, 
 * each of which returns an HTML document.
 */ 
function JSONFormatter() {
  var src = 'chrome://jsonview/locale/jsonview.properties';
  var localeService =
      Components.classes["@mozilla.org/intl/nslocaleservice;1"]
      .getService(Components.interfaces.nsILocaleService);

  var appLocale = localeService.getApplicationLocale();
  var stringBundleService =
      Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService);
  this.stringbundle = stringBundleService.createBundle(src, appLocale);
}
JSONFormatter.prototype = {
  htmlEncode: function (t) {
    return t.toString().replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  },
  
  decorateWithSpan: function (value, className) {
    return '<span class="' + className + '">' + this.htmlEncode(value) + '</span>';
  },
  
  // Convert a basic JSON datatype (number, string, boolean, null, object, array) into an HTML fragment.
  valueToHTML: function(value) {
    var valueType = typeof value;
    
    var output = "";
    if (value == null) {
      output += this.decorateWithSpan('null', 'null');
    }
    else if (value && value.constructor == Array) {
      output += this.arrayToHTML(value);
    }
    else if (valueType == 'object') {
      output += this.objectToHTML(value);
    } 
    else if (valueType == 'number') {
      output += this.decorateWithSpan(value, 'num');
    }
    else if (valueType == 'string') {
      output += this.decorateWithSpan('"' + value + '"', 'string');
    }
    else if (valueType == 'boolean') {
      output += this.decorateWithSpan(value, 'bool');
    }
    
    return output;
  },
  
  // Convert an array into an HTML fragment
  arrayToHTML: function(json) {
    var output = '[<ul class="array">';
    for ( var prop in json ) {
      output += '<li>';      
      output += this.valueToHTML(json[prop]);
      output += '</li>';
    }
    output += '</ul>]';
    return output;
  },
  
  // Convert a JSON object to an HTML fragment
  objectToHTML: function(json) {
    var output = '{<ul class="obj">';
    for ( var prop in json ) {
      output += '<li>';
      output += '<span class="prop">' + this.htmlEncode(prop) + '</span>: '
      output += this.valueToHTML(json[prop]);
      output += '</li>';
    }
    output += '</ul>}';
    return output;
  },
  
  // Convert a whole JSON object into a formatted HTML document.
  jsonToHTML: function(json, uri) {
    var output = '<div id="json">' 
    output += this.valueToHTML(json);
    output += '</div>';
    return this.toHTML(output, uri);
  },
  
  // Produce an error document for when parsing fails.
  errorPage: function(error, data, uri) {
    var output = '<div id="error">' + this.stringbundle.GetStringFromName('errorParsing') + '</div>';
    output += '<h1>' + this.stringbundle.GetStringFromName('docContents') + ':</h1>';
    output += '<div id="json">' + this.htmlEncode(data) + '</div>';
    return this.toHTML(output, uri + ' - Error');
  },
  
  // Wrap the HTML fragment in a full document. Used by jsonToHTML and errorPage.
  toHTML: function(content, title) {
    return '<doctype html>' + 
      '<html><head><title>' + title + '</title>' +
      '<link rel="stylesheet" type="text/css" href="chrome://jsonview/content/default.css">' + 
      '<script type="text/javascript" src="chrome://jsonview/content/jquery-1.2.6.js"></script>' + 
      '<script type="text/javascript" src="chrome://jsonview/content/default.js"></script>' + 
      '</head><body>' +
      content + 
      '</body></html>';
  }
};

// This component is an implementation of nsIStreamConverter that converts application/json to html
const JSONVIEW_CONVERSION =
    "?from=application/json&to=*/*";
const JSONVIEW_CONTRACT_ID =
    "@mozilla.org/streamconv;1" + JSONVIEW_CONVERSION;
const JSONVIEW_COMPONENT_ID = 
    Components.ID("{64890660-53c4-11dd-ae16-0800200c9a66}");
    
// JSONView class constructor. Not much to see here.
function JSONView() {
  // Allow us to directly access this from JavaScript
  this.wrappedJSObject = this;
  
  // Native JSON implementation, new to FF3
  this.nativeJSON = Components.classes["@mozilla.org/dom/json;1"].createInstance(Components.interfaces.nsIJSON);
  this.jsonFormatter = new JSONFormatter();
};

// This defines an object that implements our converter, and is set up to be XPCOM-ified by XPCOMUtils
JSONView.prototype = {

  // properties required for XPCOM registration:
  classDescription: "JSONView XPCOM Component",
  classID:          JSONVIEW_COMPONENT_ID,
  contractID:       JSONVIEW_CONTRACT_ID,

  _xpcom_categories: [{
    category: "@mozilla.org/streamconv;1",
    entry: JSONVIEW_CONVERSION,
    value: "JSON to HTML stream converter"
  }],
  
  QueryInterface: XPCOMUtils.generateQI([
      Components.interfaces.nsISupports,
      Components.interfaces.nsIStreamConverter,
      Components.interfaces.nsIStreamListener,
      Components.interfaces.nsIRequestObserver
  ]),
  
  /*
   * This component works as such:
   * 1. asyncConvertData captures the listener
   * 2. onStartRequest fires, initializes stuff, modifies the listener to match our output type
   * 3. onDataAvailable transcodes the data into a UTF-8 string
   * 4. onStopRequest gets the collected data and converts it, spits it to the listener
   * 5. convert does nothing, it's just the synchronous version of asyncConvertData
   */
  
  // nsIStreamConverter::convert
  convert: function (aFromStream, aFromType, aToType, aCtxt) {
      return aFromStream;
  },
  
  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function (aFromType, aToType, aListener, aCtxt) {
    // Store the listener passed to us
    this.listener = aListener;
  },
  
  // nsIStreamListener::onDataAvailable
  onDataAvailable: function (aRequest, aContext, aInputStream, aOffset, aCount) {
    // From https://developer.mozilla.org/en/Reading_textual_data
    var is = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                   .createInstance(Components.interfaces.nsIConverterInputStream);
    is.init(aInputStream, this.charset, -1, Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
  
    var str = {};
    var numChars = is.readString(aCount, str);

    this.data += str.value;
  },
  
  // nsIRequestObserver::onStartRequest
  onStartRequest: function (aRequest, aContext) {
    this.data = '';
    this.uri = aRequest.QueryInterface(Components.interfaces.nsIChannel).URI.spec;

    // Sets the charset if it is available. (For documents loaded from the
    // filesystem, this is not set.)
    this.charset = aRequest.QueryInterface(Components.interfaces.nsIChannel).contentCharset || 'UTF-8';

    this.channel = aRequest;
    this.channel.contentType = "text/html";
    // All our data will be coerced to UTF-8
    this.channel.contentCharset = "UTF-8";

    this.listener.onStartRequest (this.channel, aContext);
  },
  
  // nsIRequestObserver::onStopRequest
  onStopRequest: function (aRequest, aContext, aStatusCode) {
    /*
     * This should go something like this:
     * 1. Make sure we have a unicode string.
     * 2. Convert it to a Javascript object.
     * 3. Convert that to HTML? Or XUL?
     * 4. Spit it back out at the listener
     */
    
    var converter = Components
        .classes["@mozilla.org/intl/scriptableunicodeconverter"]
        .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
    converter.charset = this.charset;

    var outputDoc = "";
    try {
      var jsonObj = this.nativeJSON.decode(this.data);
    
      outputDoc = this.jsonFormatter.jsonToHTML(jsonObj, this.uri);
    }
    catch(e) {
      outputDoc = this.jsonFormatter.errorPage(e, this.data, this.uri);
    }
    
    // I don't really understand this part, but basically it's a way to get our UTF-8 stuff
    // spit back out as a byte stream
    // See http://www.mail-archive.com/mozilla-xpcom@mozilla.org/msg04194.html
    var storage = Components.classes["@mozilla.org/storagestream;1"]
    .createInstance(Components.interfaces.nsIStorageStream);
    
    // I have no idea what to pick for the first parameter (segments)
    storage.init(4, 0xffffffff, null);
    var out = storage.getOutputStream(0);
    
    var binout = Components.classes["@mozilla.org/binaryoutputstream;1"]
    .createInstance(Components.interfaces.nsIBinaryOutputStream);
    binout.setOutputStream(out);
    binout.writeUtf8Z(outputDoc);
    binout.close();
    
    // I can't explain it, but we need to trim 4 bytes off the front or else it includes random crap
    var trunc = 4;
    var instream = storage.newInputStream(trunc);
    
    // Pass the data to the main content listener
    this.listener.onDataAvailable(this.channel, aContext, instream, 0, storage.length - trunc);

    this.listener.onStopRequest(this.channel, aContext, aStatusCode);
  }
};

// We only have one component to register
var components = [JSONView];

// The actual hook into XPCOM
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule(components);
}