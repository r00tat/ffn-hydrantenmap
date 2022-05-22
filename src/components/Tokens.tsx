import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { addDoc, collection, doc, updateDoc, query, getDocs } from "firebase/firestore";
import { useCallback, useState, useEffect } from "react";
import { Token } from "../common/token";
import useFirebaseCollection from "../hooks/useFirebaseCollection";
import useFirebaseLogin from "../hooks/useFirebaseLogin";
import { firestore } from "./firebase/firebase";
import InputDialog from "./InputDialog";


export function useTokens() {
    /*return useFirebaseCollection<Token>({
        collectionName: 'tokens'

    });*/
    const [tokens, setTokens] = useState<Token[]>()

    useEffect(() => {
        (async () => {
            const docs = await getDocs(query(collection(firestore, "tokens")));
            setTokens(docs.docs?.map(doc => ({ id: doc.id, ...doc.data() } as Token)))
        })();
    }, [])

    return tokens;
}

export interface TokenDialogOptions {
    token?: Token,
    onClose: (token?: Token) => void
}
export function TokenDialog({
    token,
    onClose: onDialogClose
}: TokenDialogOptions) {
    const user = useFirebaseLogin();
    const onClose = useCallback(async (value?: string) => {
        // hit ok or cancel on token dialog
        let newToken: Token | undefined = undefined;
        if (value) {

            if (token && token.id) {
                // update
                console.info(`update token ${token.id} ${value}`)
                await updateDoc(doc(firestore, 'tokens', `${token.id}`), { description: value })
                newToken = { ...token, description: value };
            } else {
                // add
                console.info(`add token ${value}`)
                const docRef = await addDoc(collection(firestore, 'tokens'), { description: value, owner: user.uid });
                newToken = { id: docRef.id, description: value, owner: user.uid || 'bad-uid' }
            }
        }
        console.info(`Token Dialog close: ${JSON.stringify(newToken)}`)
        onDialogClose(newToken);
    }, [token, user, onDialogClose])
    return <InputDialog onClose={onClose} title="Token">
        Ein Token kann für den API Zugriff auf Geojson (z.b. <a href="https://lagekarte.info" target="_blank" rel="noopener">lagekarte.info</a>) verwendet werden.
        Die Schnittstelle ist unter https://{window?.location?.hostname}/api/geojson erreichbar. Der Token kann als HTTP GET Parameter oder Authorization Bearer Token verwendet werden.
    </InputDialog>
}

export default function Tokens() {
    const tokens = useTokens();
    const [addToken, setAddToken] = useState(false);
    return <>
        <Typography variant="h3">API Token</Typography>
        <Typography>Tokens: {JSON.stringify(tokens)}
        </Typography>
        <Button onClick={() => setAddToken(true)}>Neuen Token Anlegen</Button>
        {addToken && (
            <TokenDialog onClose={() => setAddToken(false)} />
        )}
    </>;
}