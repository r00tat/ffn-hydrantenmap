import { NextRequest, NextResponse } from 'next/server';
import { firebaseAuth, firestore } from '../../../../../server/firebase/admin';
import { USER_COLLECTION_ID } from '../../../../components/firebase/firestore';
import {
  CustomClaims,
  setCustomClaimsForUser,
} from '../../../users/[uid]/updateUser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firecall } = body;

    if (!firecall) {
      return NextResponse.json(
        { error: 'firecall parameter is missing' },
        { status: 400 }
      );
    }

    // 1. Create a new anonymous user
    const userRecord = await firebaseAuth.createUser({
      displayName: `Einsatz-Gast ${firecall}`,
    });
    const uid = userRecord.uid;

    // 2. Set user data in Firestore and set custom claims
    const userData = {
      authorized: true,
      groups: ['allUsers'],
      isAdmin: false,
      firecall,
    };

    await firestore.collection(USER_COLLECTION_ID).doc(uid).set(userData);

    const customClaims: CustomClaims = {
      groups: ['allUsers'],
      isAdmin: false,
      authorized: true,
    };
    await setCustomClaimsForUser(uid, customClaims);

    // 3. Create a custom token with firecall claim
    const token = await firebaseAuth.createCustomToken(uid, { firecall });

    return NextResponse.json({ token });
  } catch (error: any) {
    console.error('Error creating custom token:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
