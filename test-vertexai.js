/**
 * Test Vertex AI SDK to understand the correct response structure
 */

const { VertexAI } = require('@google-cloud/vertexai');

async function testVertexAI() {
  try {
    console.log('Initializing Vertex AI...');

    const vertexAI = new VertexAI({
      project: 'sahamati-labs',
      location: 'us-central1'
    });

    console.log('Getting generative model...');

    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    });

    console.log('Generating content...');

    const result = await model.generateContent('Say hello in a friendly way');

    console.log('\n=== Result Structure ===');
    console.log('typeof result:', typeof result);
    console.log('result keys:', Object.keys(result));

    console.log('\n=== Response Structure ===');
    console.log('typeof result.response:', typeof result.response);
    console.log('result.response keys:', Object.keys(result.response));

    console.log('\n=== Candidates ===');
    if (result.response.candidates) {
      console.log('candidates length:', result.response.candidates.length);
      console.log('candidate[0] keys:', Object.keys(result.response.candidates[0]));
      console.log('candidate[0].content keys:', Object.keys(result.response.candidates[0].content));
      console.log('candidate[0].content.parts:', result.response.candidates[0].content.parts);
    }

    console.log('\n=== Text Extraction ===');
    const text = result.response.candidates[0].content.parts[0].text;
    console.log('Generated text:', text);

    console.log('\n✅ Test successful!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testVertexAI();
