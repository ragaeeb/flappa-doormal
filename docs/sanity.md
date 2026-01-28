Thank you. This is just another bug in a long series of bugs that we have been fixing for this library with regards to page merging or wrong page attribution. The consequences of these bugs is critical.

Because clients of this library use the output segments to generate chunks to send to LLMs for translation and it is difficult for them to notice that we did not segment things correclty by merging a bunch of page contents that were not meant to be merged.

This is costly for them because it makes them having to regenerate the segments from our library then send them back to the LLMs again all over to translate them with the proper context and boundaries.

As a result witht his fix I want to give the clients some confidence that we are doing our checks and bounds to ensure we won't produce invalid segments.

To do this I want to create a sanity checker or validation function. We have a few choices so let's figure out the best way to do this.
1. We can create a validateSegments function which takes the original text, the produced segments and ensures that the rules were respected such that 