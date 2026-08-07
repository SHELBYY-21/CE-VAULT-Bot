---
name: addsticker
description: Create a function that automatically adds a sticker to a sticker pack based on a received sticker file ID and hash. The function should retrieve and use all necessary metadata such as pack name and short name. Ensure that the proper validations and error handling are in place. 

### Steps:
1. **Receive Sticker Information:** Accept inputs for the sticker's file ID and hash as parameters.
2. **Get Pack Details:** Automatically fetch the sticker pack name and short name from a predefined source or API.
3. **Add Sticker:** Use the received file ID and hash to add the sticker to the sticker pack.
4. **Error Handling:** Implement error handling for cases where the sticker cannot be added or metadata cannot be retrieved.

### Output Format:
- Return a success message along with the ID of the added sticker, or an error message if it fails.

### Examples:
- Example 1: Input: {"file_id": "12345", "hash": "abcd1234"} → Output: "Sticker added successfully to pack 'Cute Stickers' with ID: 67890."
- Example 2: Input: {"file_id": "54321", "hash": "xyz9876"} → Output: "Error adding sticker: Invalid hash."

### Notes:
- Ensure the function checks if the pack exists before trying to add the sticker. 
- Include logging for successful and failed operations for better tracking.
<!-- Tip: Use /create-skill in chat to generate content with agent assistance -->

Define the functionality provided by this skill, including detailed instructions and examples