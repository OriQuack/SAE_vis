### Agent Explanation

Coder Agents are responsible for coding in the first stage and
identifying themes in the second stage. In the coding stage, the
coders are instructed to write one to three codes for each piece of
data to capture concepts or ideas with the most analytical interest.
For each code, the coder extracts a representative quote from the
data as evidence. The resulting codes, quotes and corresponding
quote IDs are passed to the code aggregator agent. During the theme
development stage, the theme coders are given a complete version
of the codebook from the coding stage. The codebook is compressed
with LLMLingua [22, 23] to reduce token costs. The coder agents
then analyse the codes and associated quotes holistically to identify
overarching themes that reflect deeper insights into the data. These
themes, along with theme descriptions and the most relevant quotes,
are then passed to the theme aggregator.
Aggregator Agents refine and organize the outputs from the coder
agents into structured formats suitable for the next stage. During
the coding stage, the code aggregator merges codes with similar
meanings, retaining differences where necessary, and organizes
the codes, quotes, and quote IDs into JSON format, which the reviewer agent uses to update the codebook. Similarly, in the theme
development stage, the theme aggregator refines and organizes the
identified themes and associated quotes, merging similar themes
and outputting the final themes in JSON format.
Reviewer Agent operates exclusively during the coding stage,
maintaining and updating the codebook. This codebook stores previous codes, their corresponding quotes, and quote IDs in JSON
format. Each entry in the codebook is a code, and its associated
quotes are nested below each code along with their quote IDs. Codes
are represented both as texts and as embeddings, generated using
a Sentence Transformer model [42]. The reviewer agent processes
new codes and quotes from the aggregator and retrieves the top-
𝑘 similar codes and quotes from the codebook by computing the
cosine similarity between their code embeddings. The reviewer
compares the new codes and quotes with existing codes and quotes
to determine whether these codes can be updated and whether
similar existing codes can be merged. After making these decisions,
the reviewer updates the codebook to save new codes and quotes
and merge similar codes. The reviewing and updating process is
crucial in TA, as it plays a central role in ensuring the codes remain
dynamic, interpretative, and responsive to the data. Once finalized,
the codebook is passed to the theme development stage.

### Coder Identities
TA inherently embraces subjectivity, recognizing that researchers
bring their own perspectives, assumptions, and interpretations
to the data [6, 18]. The identification of themes is guided by the
coder’s insights and understanding, which plays an active role in
deciding what is meaningful in the data. Consequently, the same
data may yield different themes depending on who is conducting
the analysis. Coders may interpret the same information in diverse
ways, especially when they come from varied social, cultural, or
professional backgrounds. This variability does not undermine the
reliability of the analysis but instead highlights the subjectivity that
enriches qualitative research. The subjective nature of thematic
analysis allows it to delve deeply into human experiences, emotions,
and meanings while providing the contextual understanding needed
to explore nuanced social and cultural issues [18, 38].
In previous work on computational thematic analysis, the LLM’s
outputs are aligned with a human coder through iterative feedback.
In contrast, Thematic-LM simulates coders with varied backgrounds
to foster diverse perspectives in data interpretation. In profiling
the coder agents, we draw from existing literature on different
viewpoints and opinions related to the subject matter, assigning
distinct identities to the system message of each agent. These agents
are instructed to interpret the data through the lens of their assigned
identities, reflecting on how someone with such a background might
perceive and analyse the information. This approach allows us to
explore the diversity of perspectives that may emerge from the
data and offers a way to measure the divergence between coders’
interpretations due to different backgrounds.

### Main Prompt
The prompt for the coder with no identity given is shown below:
“You are a coder in thematic analysis of social media data. When
given a social media post, write 1-3 codes for the post. The code should
capture concepts or ideas with the most analytical interests. For each
code, extract a quote from the post corresponding to the code. The
quote needs to be an extract from a sentence. Output the codes and
quotes in the following format...”
The prompt for the aggregator is shown below:
“You are an aggregator coder in the thematic analysis of social media
data. Your job is to take the codes and corresponding quotes from other
coders, merge the similar codes and retain the different ones. Store the
quotes under the merged codes, and keep the top {K} most relevant
quotes. Output the codes and quotes in JSON format. Don’t output
anything else. Quote_id is the same as data_id. Example...”
The prompt for the reviewer is shown below:
“You are a review coder in the thematic analysis of social media data.
Your job is to review the previously coded data with new codes, merge
similar codes, and give them more representative codes. You will be
given two items. The first contains new codes and quotes; the second
contains similar codes and corresponding quotes to each new code. Decide if there are previously similar coded data with the same meaning
that can be merged with the new codes. Update the new code according
to the previous code if needed. If the previous codes are all different or
there are no similar codes, leave the merge_codes empty in the output.
Output the updated codes and quotes in JSON format...”
The prompt for the theme coder is shown below:
“You are a coder in the thematic analysis of social media data. Your
job is to develop themes from codes and their corresponding quotes
from the data. When given the codebook in JSON with codes and
quotes, identify themes which reflect deeper meanings of the data.
For each theme, write one sentence to describe what the theme talks
about. Keep top {K} most relevant quotes; each theme has no more
than ten quotes. Output the themes, description and related quotes in
the following JSON format...”