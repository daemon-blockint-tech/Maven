// Customer DELETE guard logic implementation

function deleteParty(partyId) {
    // Check if there are existing transactions for the party
    const transactions = getTransactionsByPartyId(partyId);
    if (transactions.length > 0) {
        throw new Error('Cannot delete party; existing transactions found.');
    }
    // Proceed with deletion
    // ... deletion logic here
}