## Functions
<dl>
<dt><a href="#buildRequest">buildRequest()</a> ⇒ <code>String</code> | <code>Array</code></dt>
<dd><p>Returns an array of sample QBXML requests</p>
</dd>
<dt><a href="#parseForVersion">parseForVersion(input)</a> ⇒ <code>String</code></dt>
<dd><p>Parses the first two version components out of the standard four component
version number: <code>&lt;Major&gt;.&lt;Minor&gt;.&lt;Release&gt;.&lt;Build&gt;</code></p>
</dd>
<dt><a href="#serviceLog">serviceLog(input)</a></dt>
<dd><p>Writes a string to the console and log file</p>
</dd>
<dt><a href="#announceMethod">announceMethod(name, params)</a></dt>
<dd><p>Logs qbws method calls and their parameters</p>
</dd>
<dt><a href="#clientVersion">clientVersion(strVersion)</a> ⇒ <code>String</code></dt>
<dd><p>An optional callback that allows the web service to evaluate
the current web connector version and react to it. Not currently required to
support backward compatibility but strongly recommended.</p>
<p>Supply one of the following return strings:</p>
<ul>
<li>&quot;NULL&quot; or &quot;&quot; (empty string) if you want the Web
Connector to proceed with the update</li>
<li>&quot;W:<any text>&quot; if you want the web Connector to display
a WARNING dialog prompting the user to continue with the
update or cancel it. The text string after the &quot;W:&quot; will
be displayed in the warning dialog.</li>
<li>&quot;E:<any text>&quot; if you want to cancel the update and
display an ERROR dialog. The text string after &quot;E:&quot; will
be displayed in the error dialog. The user will have to
download a new version of the Web Connector to continue
with the update.</li>
<li>&quot;O:<version number>&quot; to tell the user that the server
expects a newer version of QBWC than the user currently
has but also tells the user which version is needed</li>
</ul>
</dd>
</dl>
<a name="buildRequest"></a>
## buildRequest() ⇒ <code>String</code> &#124; <code>Array</code>
Returns an array of sample QBXML requests

**Kind**: global function  
**Returns**: <code>String</code> &#124; <code>Array</code> - QBXML requests: CustomerQuery, InvoiceQuery and BillQuery  
<a name="parseForVersion"></a>
## parseForVersion(input) ⇒ <code>String</code>
Parses the first two version components out of the standard four componentversion number: `<Major>.<Minor>.<Release>.<Build>`

**Kind**: global function  
**Summary**: test!  
**Returns**: <code>String</code> - First two version components (i.e. &lt;Major>.&lt;Minor>)or the original input parameter if it does not match the regular expression  

| Param | Type | Description |
| --- | --- | --- |
| input | <code>String</code> | A version number |

**Example**  
```js
// returns 2.0parseForVersion("2.0.1.30");
```
<a name="serviceLog"></a>
## serviceLog(input)
Writes a string to the console and log file

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| input | <code>String</code> | String to be logged |

<a name="announceMethod"></a>
## announceMethod(name, params)
Logs qbws method calls and their parameters

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | The name of the method |
| params | <code>Object</code> | The parameters sent with the method's function call |

<a name="clientVersion"></a>
## clientVersion(strVersion) ⇒ <code>String</code>
An optional callback that allows the web service to evaluatethe current web connector version and react to it. Not currently required tosupport backward compatibility but strongly recommended.Supply one of the following return strings: - "NULL" or "" (empty string) if you want the Web   Connector to proceed with the update - "W:<any text>" if you want the web Connector to display   a WARNING dialog prompting the user to continue with the   update or cancel it. The text string after the "W:" will   be displayed in the warning dialog. - "E:<any text>" if you want to cancel the update and   display an ERROR dialog. The text string after "E:" will   be displayed in the error dialog. The user will have to   download a new version of the Web Connector to continue   with the update. - "O:<version number>" to tell the user that the server   expects a newer version of QBWC than the user currently   has but also tells the user which version is needed

**Kind**: global function  
**Summary**: An optional callback that allows the web service to evaluate thecurrent web connector version and react to it.  
**Returns**: <code>String</code> - A string telling the Web Connector what to do next.  

| Param | Type | Description |
| --- | --- | --- |
| strVersion | <code>String</code> | The version of the QB web connector supplied in the                                web connector's call to clientVersion |

