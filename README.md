# webCompatSiteDiagnosisHelper
A Firefox WebExtension to help ease webcompat site diagnosis, by providing simple overrides and wrappers for web APIs, making it easier to perform repetitive or one-off tasks which may be tricky or tiresome to handle with just the developer tools alone. The sky is the limit; here are some quick examples of what can be done with varying levels of JS know-how:

- easily overriding the value sites will see for properties like navigator.userAgent.
- logging a stack trace every time navigator.userAgent is accessed, so that we don’t have to hunt down which file(s) access it.
- starting the JS debugger each time document.createElement(“audio”) (or an equivalent) is called.
- intercepting calls to XMLHttpRequest.send, to inspect or tweak the request object prior to actually sending it.
- figuring out which of the various ways the site tries to adjust the scroll position of the page, be it window.scroll, document.body.scrollTop, document.documentElement.scrollTop, or not at all.
- easily determining whether the site is reading properties that Firefox normally does not even provide, such as msTouchMaxPoints.
- being selective about which events/XHRs/etc should trigger a breakpoint (perhaps only for elements that match certain criteria, or XHRs with specific headers).
- intercepting calls to functions such as setTimeout and setInterval, to easily tweak their time-values or re-diret the calls to requestAnimationFrame or requestIdleTimeout instead.
- inject a polyfill script before the rest of the page loads and runs.

The add-on is bundled with pre-fabricated examples of varying complexity and several helpers which should make it easier to create your own. Usage is as simple as using about:debugging to temporarily load the add-on from a local directory, reloading it and the tab in question with each change to the content.js, and removing the addon (or disabling it) when it is not needed.
