# Test Redis perfomance 

## Data Generation:
- 1000 organizations were created, each containing between 100 and 1000 encrypted users.
- A total of 543,462 users were generated and stored.


## Performance Testing:
- The test executed 10,000 random queries, measuring the response times for two types of operations:
    - Key-Value lookup (test_kv): Fetching orgId using the encrypted userId from a plain key-value store.
    - JSON lookup (test_json): Checking if a specific userId exists in the array of users for a given orgId using the ARRINDEX operation in Redis JSON.

## Results:
- Average response time for test_kv (Plain Key-Value):
1.35943 ms. FASTER
- Average response time for test_json (ARRINDEX in JSON array): 
1.52893 ms.

