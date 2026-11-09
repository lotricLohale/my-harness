export interface OrderedAccount {
	id: string;
	priority?: number;
}

/** Higher priority is consumed first. Equal priority falls back to id. */
export function consumptionOrder<T extends OrderedAccount>(
	accounts: readonly T[],
): T[] {
	return [...accounts].sort(
		(a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id),
	);
}

/** Rewrite priorities so `orderedIds[0]` is consumed first. */
export function withConsumptionOrder<T extends OrderedAccount>(
	accounts: readonly T[],
	orderedIds: readonly string[],
): T[] {
	const rank = new Map(
		orderedIds.map((id, index) => [id, orderedIds.length - index]),
	);
	return accounts.map((account) => ({
		...account,
		priority: rank.get(account.id) ?? account.priority ?? 0,
	}));
}
