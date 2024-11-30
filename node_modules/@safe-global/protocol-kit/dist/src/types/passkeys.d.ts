export type PasskeyCoordinates = {
    x: string;
    y: string;
};
export type PasskeyArgType = {
    rawId: string;
    coordinates: PasskeyCoordinates;
    customVerifierAddress?: string;
};
